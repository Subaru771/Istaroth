; Istaroth color-only offline installer. Electron runtime is bundled with the app.
#ifndef AppVersion
  #define AppVersion "1.1.0"
#endif
#ifndef AppSource
  #define AppSource "..\app\dist\win-unpacked"
#endif

[Setup]
AppId={{B9A6F0E0-9B92-4C68-9961-8AA94B03B2F5}
AppName=Istaroth
AppVerName=Istaroth {#AppVersion} — Color Only
AppVersion={#AppVersion}
AppPublisher=Istaroth open-source contributors
AppPublisherURL=https://github.com/Subaru771/Istaroth
AppSupportURL=https://github.com/Subaru771/Istaroth/issues
DefaultDirName={localappdata}\Programs\Istaroth-Color-Only
DefaultGroupName=Istaroth
PrivilegesRequired=lowest
DisableDirPage=no
DisableProgramGroupPage=yes
WizardStyle=modern
SetupIconFile=..\app\assets\icon.ico
UninstallDisplayIcon={app}\Istaroth.exe
OutputDir=..\app\dist
OutputBaseFilename=Istaroth-v{#AppVersion}-Color-Only-Setup-Windows-x64-UNSIGNED
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
CloseApplications=yes
RestartApplications=no

[Files]
Source: "{#AppSource}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\Istaroth"; Filename: "{app}\Istaroth.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\Istaroth"; Filename: "{app}\Istaroth.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Tasks]
Name: desktopicon; Description: "Create a desktop shortcut"; GroupDescription: "Additional options:"; Flags: unchecked

[Run]
Filename: "{app}\Istaroth.exe"; Description: "Launch Istaroth"; Flags: nowait postinstall skipifsilent
