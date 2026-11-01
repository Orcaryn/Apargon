; An installer with only arm64 goes to Program Files (x86): electron-builder picks 64-bit Program Files only for x64. Where it looks for an earlier install, name the right one.
!macro preInit
  SetRegView 64
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "$PROGRAMFILES64\${APP_FILENAME}"
!macroend
