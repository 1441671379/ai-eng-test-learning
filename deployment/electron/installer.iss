#ifndef SourceRoot
  #error SourceRoot must be the verified desktop application directory
#endif
#ifndef OutputRoot
  #error OutputRoot must be supplied by build_installer.py
#endif
#ifndef ProductVersion
  #define ProductVersion "0.3.0"
#endif

[Setup]
AppId={{16B963DB-3876-4F09-AD5D-9E5E645C0FF5}
AppName=English Learning
AppVersion={#ProductVersion}
AppPublisher=English Learning Project
AppComments=Local English learning with external language-model APIs
DefaultDirName={localappdata}\Programs\English Learning Desktop
DefaultGroupName=English Learning Desktop
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.19041
OutputDir={#OutputRoot}
OutputBaseFilename=EnglishLearning-{#ProductVersion}-Windows-x64-Setup
Compression=lzma2/max
SolidCompression=yes
LZMADictionarySize=8192
LZMABlockSize=32768
LZMANumBlockThreads=4
LZMAUseSeparateProcess=yes
DiskSpanning=yes
DiskSliceSize=2000000000
SlicesPerDisk=1
WizardStyle=modern
DisableProgramGroupPage=yes
DisableDirPage=no
UninstallDisplayIcon={app}\EnglishLearning.exe
UninstallDisplayName=English Learning Desktop
CloseApplications=yes
RestartApplications=no
SetupMutex=EnglishLearningDesktopInstaller
InfoBeforeFile=installer-info.txt
VersionInfoDescription=English Learning Desktop Setup

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "chinesesimplified"; MessagesFile: "installer\ChineseSimplified.isl"

[Tasks]
Name: desktopicon; Description: "{cm:CreateDesktopIcon}"; Flags: checkedonce

[InstallDelete]
; Immutable app assets are replaced as a unit when upgrading (including the
; Python environment). Learner data stays outside {app}, under %APPDATA%.
Type: filesandordirs; Name: "{app}\resources"

[Files]
Source: "{#SourceRoot}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "installer\ChineseSimplified-LICENSE.txt"; DestDir: "{app}\resources\licenses"; DestName: "Inno-Chinese-MIT.txt"; Flags: ignoreversion

[Icons]
Name: "{group}\English Learning"; Filename: "{app}\EnglishLearning.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\English Learning"; Filename: "{app}\EnglishLearning.exe"; WorkingDir: "{app}"; Tasks: desktopicon
Name: "{group}\使用说明"; Filename: "{app}\使用说明.txt"
Name: "{group}\Uninstall English Learning"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\EnglishLearning.exe"; Description: "{cm:LaunchProgram,English Learning}"; Flags: nowait postinstall skipifsilent

[Code]
function TargetContainsRunningProcesses: Boolean;
var
  Locator, Services, Processes, Process: Variant;
  PathPrefix, ProcessPath: String;
  Index: Integer;
begin
  Result := False;
  PathPrefix := Uppercase(AddBackslash(ExpandConstant('{app}')));
  try
    Locator := CreateOleObject('WbemScripting.SWbemLocator');
    Services := Locator.ConnectServer('', 'root\CIMV2');
    Processes := Services.ExecQuery('SELECT ExecutablePath FROM Win32_Process WHERE ExecutablePath IS NOT NULL');
    for Index := 0 to Processes.Count - 1 do begin
      Process := Processes.ItemIndex(Index);
      if not VarIsNull(Process.ExecutablePath) then begin
        ProcessPath := Process.ExecutablePath;
        ProcessPath := Uppercase(ProcessPath);
        if (Pos(PathPrefix, ProcessPath) = 1) and
          (CompareText(ExtractFileName(ProcessPath), 'unins000.exe') <> 0) then begin
          Result := True;
          Exit;
        end;
      end;
    end;
  except
    Log('Process-path check unavailable; retaining Windows Restart Manager file checks.');
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  FindRec: TFindRec;
  Nonempty: Boolean;
begin
  Result := '';
  Nonempty := False;
  if FindFirst(AddBackslash(ExpandConstant('{app}')) + '*', FindRec) then begin
    try
      repeat
        if (FindRec.Name <> '.') and (FindRec.Name <> '..') then Nonempty := True;
      until not FindNext(FindRec);
    finally
      FindClose(FindRec);
    end;
  end;
  if Nonempty and not (FileExists(ExpandConstant('{app}\EnglishLearning.exe')) and
    FileExists(ExpandConstant('{app}\resources\bundle-manifest.json'))) then begin
    Result := 'Please choose an empty folder or an existing English Learning Desktop installation.' + #13#10 +
      '请选择空文件夹，或现有 English Learning Desktop 的安装目录。';
    Exit;
  end;
  if TargetContainsRunningProcesses then
    Result := 'Please exit English Learning and wait for its background services to stop, then try again.' + #13#10 +
      '请先退出 English Learning，等待后台服务停止后再继续安装。';
end;

function InitializeUninstall: Boolean;
begin
  Result := not TargetContainsRunningProcesses;
  if not Result then SuppressibleMsgBox('Please exit English Learning and wait for its background services to stop before uninstalling.' + #13#10 +
    '请先退出 English Learning，等待后台服务停止后再卸载。', mbInformation, MB_OK, IDOK);
end;

{ Learning records, API settings and audio live in %APPDATA%\EnglishLearningDesktop.
  No UninstallDelete entry may remove that profile, even during an upgrade. }
