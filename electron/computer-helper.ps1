param(
  [Parameter(Mandatory = $true)][ValidateSet('inspect','click','type','key')][string]$Action,
  [int]$X = 0,
  [int]$Y = 0,
  [string]$TextBase64 = '',
  [string]$Key = ''
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class DamaNativeInput {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT point);
  public struct POINT { public int X; public int Y; }
}
'@

function Write-Result($value) {
  $value | ConvertTo-Json -Depth 7 -Compress
}

if ($Action -eq 'click') {
  if (-not [DamaNativeInput]::SetCursorPos($X, $Y)) { throw 'Não foi possível mover o ponteiro.' }
  Start-Sleep -Milliseconds 80
  [DamaNativeInput]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
  [DamaNativeInput]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
  Write-Result @{ ok = $true; action = 'click'; x = $X; y = $Y }
  exit 0
}

if ($Action -eq 'type') {
  $text = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($TextBase64))
  if ($text.Length -gt 8000) { throw 'O texto excede o limite de 8.000 caracteres.' }
  foreach ($character in $text.ToCharArray()) {
    $value = [string]$character
    if ('+^%~(){}[]'.Contains($value)) { $value = '{' + $value + '}' }
    if ($character -eq "`n") { $value = '{ENTER}' }
    if ($character -eq "`t") { $value = '{TAB}' }
    [Windows.Forms.SendKeys]::SendWait($value)
  }
  Write-Result @{ ok = $true; action = 'type'; characters = $text.Length }
  exit 0
}

if ($Action -eq 'key') {
  $allowed = @('ENTER','TAB','SPACE','UP','DOWN','LEFT','RIGHT','BACKSPACE','DELETE','HOME','END','PAGEDOWN','PAGEUP')
  $normalized = $Key.ToUpperInvariant()
  if ($allowed -notcontains $normalized) { throw 'Tecla não permitida nesta ferramenta.' }
  $sendKey = if ($normalized -eq 'SPACE') { ' ' } else { '{' + $normalized + '}' }
  [Windows.Forms.SendKeys]::SendWait($sendKey)
  Write-Result @{ ok = $true; action = 'key'; key = $normalized }
  exit 0
}

$handle = [DamaNativeInput]::GetForegroundWindow()
$root = if ($handle -ne [IntPtr]::Zero) { [Windows.Automation.AutomationElement]::FromHandle($handle) } else { $null }
$cursor = New-Object DamaNativeInput+POINT
[void][DamaNativeInput]::GetCursorPos([ref]$cursor)
$controls = @()
if ($null -ne $root) {
  $collection = $root.FindAll([Windows.Automation.TreeScope]::Descendants, [Windows.Automation.Condition]::TrueCondition)
  $limit = [Math]::Min(260, $collection.Count)
  for ($index = 0; $index -lt $limit; $index++) {
    try {
      $item = $collection.Item($index)
      $current = $item.Current
      $rect = $current.BoundingRectangle
      if ($rect.Width -le 0 -or $rect.Height -le 0 -or $current.IsOffscreen) { continue }
      $controlType = $current.ControlType.ProgrammaticName.Replace('ControlType.', '')
      $name = [string]$current.Name
      if ($name.Length -gt 240) { $name = $name.Substring(0, 240) }
      $controls += @{
        name = $name
        type = $controlType
        automationId = [string]$current.AutomationId
        enabled = [bool]$current.IsEnabled
        bounds = @{ x = [Math]::Round($rect.X); y = [Math]::Round($rect.Y); width = [Math]::Round($rect.Width); height = [Math]::Round($rect.Height) }
      }
    } catch {}
  }
}
$windowRect = if ($null -ne $root) { $root.Current.BoundingRectangle } else { $null }
Write-Result @{
  ok = $true
  action = 'inspect'
  cursor = @{ x = $cursor.X; y = $cursor.Y }
  window = if ($null -ne $root) { @{ title = [string]$root.Current.Name; processId = $root.Current.ProcessId; bounds = @{ x = [Math]::Round($windowRect.X); y = [Math]::Round($windowRect.Y); width = [Math]::Round($windowRect.Width); height = [Math]::Round($windowRect.Height) } } } else { $null }
  controls = $controls
}
