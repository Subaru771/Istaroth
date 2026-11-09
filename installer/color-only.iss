; Istaroth offline installer: color-only built-in regional themes, optional user wallpapers. Electron bundled.
#ifndef AppVersion
  #define AppVersion "1.1.3"
#endif
#ifndef AppSource
  #define AppSource "..\app\dist\win-unpacked"
#endif

[Setup]
AppId={{B9A6F0E0-9B92-4C68-9961-8AA94B03B2F5}
AppName=Istaroth
AppVerName=Istaroth {#AppVersion} — Color Themes + Personal Wallpapers
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
OutputBaseFilename=Istaroth-v{#AppVersion}-Wallpapers-Setup-Windows-x64-UNSIGNED
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
CloseApplications=yes
RestartApplications=no

[Files]
Source: "{#AppSource}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\Istaroth"; Filename: "{app}\Istaroth.exe"; WorkingDir: "{app}"
Name: "{userdesktop}\Istaroth"; Filename: "{app}\Istaroth.exe"; WorkingDir: "{app}"

[Run]
Filename: "{app}\Istaroth.exe"; Description: "Launch Istaroth"; Flags: nowait postinstall skipifsilent

; The older NSIS or portable Istaroth instance uses the same Electron
; single-instance lock, so starting this new build while the old app runs
; would silently bring the OLD interface to the front.
; Close running copies at install time before copying the new executable.
[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ExitCode: Integer;
begin
  Result := '';
  Log('Closing any previous Istaroth.exe instances so the new version can launch');
  if not Exec(ExpandConstant('{sys}\taskkill.exe'), '/IM Istaroth.exe /T /F', '',
    SW_HIDE, ewWaitUntilTerminated, ExitCode) then
    Log('No running Istaroth process could be closed; Windows may not have taskkill available');
end;
