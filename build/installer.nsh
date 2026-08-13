!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "MUI2.nsh"

!ifndef BUILD_UNINSTALLER
!if /FileExists "${PROJECT_DIR}\dama-engine-payload\manifest.json"
Var DamaAiCheckbox
Var DamaAiRequested

Function DamaAiPageCreate
  !insertmacro MUI_HEADER_TEXT "Dama AI" "Escolha os componentes da instalação"
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 4u 100% 24u "A Dama funciona com as suas APIs mesmo sem este componente."
  Pop $0
  ${NSD_CreateCheckbox} 0 39u 100% 16u "Baixar e instalar Dama AI"
  Pop $DamaAiCheckbox
  ${NSD_Check} $DamaAiCheckbox
  ${NSD_CreateLabel} 18u 60u 92% 36u "Instala localmente o motor Carnaval/Dama e suas ferramentas. Os modelos e tokens continuam sendo os provedores configurados por você."
  Pop $0

  nsDialogs::Show
FunctionEnd

Function DamaAiPageLeave
  ${NSD_GetState} $DamaAiCheckbox $DamaAiRequested
FunctionEnd

!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
  Page custom DamaAiPageCreate DamaAiPageLeave
!macroend

!macro customInstall
  RMDir /r "$INSTDIR\resources\dama-engine"
  ${If} $DamaAiRequested == ${BST_CHECKED}
    SetOutPath "$INSTDIR\resources\dama-engine"
    File /r "${PROJECT_DIR}\dama-engine-payload\*.*"
  ${EndIf}
!macroend
!endif
!endif

!macro customUnInstall
  RMDir /r "$INSTDIR\resources\dama-engine"
!macroend
