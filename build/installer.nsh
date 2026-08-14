!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "MUI2.nsh"

!ifndef BUILD_UNINSTALLER
!macro customInit
  ; Versões antigas guardavam o motor dentro da pasta do aplicativo. Antes que
  ; o atualizador substitua essa pasta, movemos o componente para userData,
  ; que é preservado entre versões e também é lido pelo runtime da Dama.
  IfFileExists "$INSTDIR\resources\dama-engine\manifest.json" 0 dama_ai_migration_done
  CreateDirectory "$APPDATA\Dama\components"
  RMDir /r "$APPDATA\Dama\components\dama-ai.migrating"
  Rename "$INSTDIR\resources\dama-engine" "$APPDATA\Dama\components\dama-ai.migrating"
  IfErrors dama_ai_migration_done
  RMDir /r "$APPDATA\Dama\components\dama-ai"
  Rename "$APPDATA\Dama\components\dama-ai.migrating" "$APPDATA\Dama\components\dama-ai"
dama_ai_migration_done:
!macroend

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
  ${NSD_CreateCheckbox} 0 39u 100% 16u "Instalar Dama AI"
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
  ${If} $DamaAiRequested == ${BST_CHECKED}
    RMDir /r "$APPDATA\Dama\components\dama-ai"
    SetOutPath "$APPDATA\Dama\components\dama-ai"
    File /r "${PROJECT_DIR}\dama-engine-payload\*.*"
  ${EndIf}
!macroend
!endif
!endif

!macro customUnInstall
  RMDir /r "$INSTDIR\resources\dama-engine"
!macroend
