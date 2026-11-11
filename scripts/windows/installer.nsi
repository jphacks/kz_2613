; Re:Cooplay の Windows インストーラー (#219)
; build-installer.ps1 から呼ぶ。package.ps1 が作った配布フォルダ (zipと同じ中身) をそのまま入れる。
;   makensis /DVERSION=0.1.0 /DVIVERSION=0.1.0.0 /DSRC=<配布フォルダ> /DOUTFILE=<setup.exe> /DICON=<icon.ico> installer.nsi
;
; 方針 (Issue #219 の本人確定要件 Q19〜23・Q30〜31・Q36〜37)
; - 一般ユーザー権限で %LOCALAPPDATA%\Programs\ReCooplay に入れる (書き込める場所なので logs\ もそのまま使える)
; - 正式サポートは Windows 11 x64。それ以外は「保証外」と示し、技術的に動く条件を満たすときだけ続行を選べる
; - WebView2・VC++ ランタイムの不足を調べ、本人が同意したときだけMicrosoft公式から取得し、署名を確かめて導入する
; - ファイアウォールの許可は初期OFF。同意したときだけ追加し、アンインストール時に削除するか尋ねる
; - サイレント (/S) では同意を得られないので、取得・PC設定の変更は一切しない
; 補助オプション: /REPORT=<ファイル>  事前チェックの結果だけを書いて終了する (導入しない)
;                 /SIMULATE_MISSING_WEBVIEW2 /SIMULATE_MISSING_VCREDIST  不足時の流れを試験するため、検出結果を「不足」にする
; 相対ジャンプ (+2 など) は LogicLib のマクロと混ざると数え違えるため使わず、ラベルで飛ぶ。

Unicode true
ManifestDPIAware true
RequestExecutionLevel user
SetCompressor /SOLID lzma

!ifndef VERSION
  !error "VERSION を /DVERSION=... で指定してください"
!endif
!ifndef VIVERSION
  !error "VIVERSION を /DVIVERSION=a.b.c.d で指定してください"
!endif
!ifndef SRC
  !error "SRC (package.ps1 の配布フォルダ) を指定してください"
!endif
!ifndef OUTFILE
  !error "OUTFILE を指定してください"
!endif
!ifndef ICON
  !error "ICON を指定してください"
!endif
; ホストのビルドに使ったMSVCより古いランタイムでは起動しないことがあるため、14.<この値> 以上を求める
!ifndef MIN_VC_MINOR
  !define MIN_VC_MINOR 40
!endif

!define APP_NAME "Re:Cooplay"
!define APP_KEY "ReCooplay"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_KEY}"
!define SETTINGS_KEY "Software\${APP_KEY}"
!define VC_URL "https://aka.ms/vs/17/release/vc_redist.x64.exe"
!define VC_HELP "https://learn.microsoft.com/cpp/windows/latest-supported-vc-redist"
!define WV2_URL "https://go.microsoft.com/fwlink/p/?LinkId=2124703"
!define WV2_HELP "https://developer.microsoft.com/microsoft-edge/webview2/"
!define WV2_GUID "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
!define POWERSHELL "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe"

!include "MUI2.nsh"
!include "x64.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"

Name "${APP_NAME}"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\${APP_KEY}"
InstallDirRegKey HKCU "${SETTINGS_KEY}" "InstallDir"
BrandingText "${APP_NAME} ${VERSION}"
ShowInstDetails show
ShowUninstDetails show

!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\recooplay-desktop.exe"
!define MUI_FINISHPAGE_RUN_TEXT "${APP_NAME} を起動する"
!define MUI_FINISHPAGE_SHOWREADME ""
!define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED
!define MUI_FINISHPAGE_SHOWREADME_TEXT "デスクトップにショートカットを作る"
!define MUI_FINISHPAGE_SHOWREADME_FUNCTION CreateDesktopShortcut

!insertmacro MUI_PAGE_LICENSE "${SRC}\LICENSE"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
; 直後のページ (完了) にだけ効く
!define MUI_PAGE_CUSTOMFUNCTION_SHOW FinishPageShow
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Japanese"

VIProductVersion "${VIVERSION}"
VIAddVersionKey /LANG=${LANG_JAPANESE} "ProductName" "${APP_NAME}"
VIAddVersionKey /LANG=${LANG_JAPANESE} "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=${LANG_JAPANESE} "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=${LANG_JAPANESE} "FileDescription" "${APP_NAME} Setup"
VIAddVersionKey /LANG=${LANG_JAPANESE} "LegalCopyright" "Re:Cooplay (JPHACKS kz_2613)"

Var OsBuild
Var OsType        ; Client / Server
Var Arch          ; x64 / arm64 / x86
Var OsVerdict     ; supported / unsupported / blocked
Var Wv2Version    ; 空なら不足
Var VcVersion     ; 空なら不足 (または古い)
Var VcDetail
Var SimWv2        ; 1 なら WebView2 を不足扱い (試験用)
Var SimVc         ; 1 なら VC++ を不足扱い (試験用)
Var Decisions     ; 記録用。導入・拒否・失敗の経過
Var RuntimeMissing

; ---- 検出 ------------------------------------------------------------------

Function DetectOs
  ReadRegStr $OsBuild HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion" "CurrentBuildNumber"
  ReadRegStr $OsType HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion" "InstallationType"
  ${If} $OsBuild == ""
    StrCpy $OsBuild 0
  ${EndIf}
  ${If} ${IsNativeAMD64}
    StrCpy $Arch "x64"
  ${ElseIf} ${IsNativeARM64}
    StrCpy $Arch "arm64"
  ${Else}
    StrCpy $Arch "x86"
  ${EndIf}
  ; 正式サポート: Windows 11 (build 22000以上) のクライアント版 x64
  ; 保証外で続行可: x64 の Windows 10 1809 (17763) 以上・Server、Windows 11 の ARM64 (x64 エミュレーション)
  ; 停止: 32bit Windows、Windows 10 の ARM64 (x64 エミュレーションなし)、それより古い Windows (WebView2 非対応)
  StrCpy $OsVerdict "blocked"
  ${If} $Arch == "x64"
    ${If} $OsBuild >= 22000
    ${AndIf} $OsType == "Client"
      StrCpy $OsVerdict "supported"
    ${ElseIf} $OsBuild >= 17763
      StrCpy $OsVerdict "unsupported"
    ${EndIf}
  ${ElseIf} $Arch == "arm64"
    ${If} $OsBuild >= 22000
      StrCpy $OsVerdict "unsupported"
    ${EndIf}
  ${EndIf}
FunctionEnd

Function DetectWebView2
  ; Microsoft の案内どおり、マシン全体 (64bit Windows では WOW6432Node) と利用者ごとの両方を見る
  StrCpy $Wv2Version ""
  SetRegView 32
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\${WV2_GUID}" "pv"
  ${If} $0 == ""
  ${OrIf} $0 == "0.0.0.0"
    ReadRegStr $0 HKCU "Software\Microsoft\EdgeUpdate\Clients\${WV2_GUID}" "pv"
  ${EndIf}
  ${If} $0 != ""
  ${AndIf} $0 != "0.0.0.0"
    StrCpy $Wv2Version $0
  ${EndIf}
  ${If} $SimWv2 == 1
    StrCpy $Wv2Version ""
  ${EndIf}
FunctionEnd

Function DetectVcRedist
  ; レジストリ (x64 の再頒布可能パッケージが書く値) → 実際に読み込まれる System32 のDLLの版、の順で確かめる
  StrCpy $VcVersion ""
  StrCpy $VcDetail "none"
  SetRegView 32
  ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  ReadRegDWORD $1 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Major"
  ReadRegDWORD $2 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Minor"
  ReadRegDWORD $3 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Bld"
  ${If} $0 == 1
    StrCpy $VcDetail "registry-$1.$2.$3"
    ${If} $1 == 14
    ${AndIf} $2 >= ${MIN_VC_MINOR}
      StrCpy $VcVersion "$1.$2.$3"
    ${EndIf}
  ${EndIf}
  ${If} $VcVersion == ""
  ${AndIf} $Arch == "x64"
    StrCpy $4 "ok"
    StrCpy $5 "99"
    ${DisableX64FSRedirection}
    Push "$WINDIR\System32\msvcp140.dll"
    Push "$WINDIR\System32\vcruntime140_1.dll"
    Push "$WINDIR\System32\vcruntime140.dll"
    ${For} $6 1 3
      Pop $7
      ClearErrors
      GetDLLVersion $7 $8 $9
      ${If} ${Errors}
        StrCpy $4 "missing"
      ${Else}
        IntOp $R7 $8 >> 16
        IntOp $R8 $8 & 0xFFFF
        ${If} $R7 <> 14
        ${OrIf} $R8 < ${MIN_VC_MINOR}
          StrCpy $4 "old-$R7.$R8"
        ${ElseIf} $R8 < $5
          StrCpy $5 $R8
        ${EndIf}
      ${EndIf}
    ${Next}
    ${EnableX64FSRedirection}
    ${If} $4 == "ok"
      StrCpy $VcVersion "dll-14.$5"
    ${ElseIf} $VcDetail == "none"
      StrCpy $VcDetail "dll-$4"
    ${EndIf}
  ${EndIf}
  ${If} $SimVc == 1
    StrCpy $VcVersion ""
  ${EndIf}
FunctionEnd

; ---- 記録 ------------------------------------------------------------------

Function WriteReportTo ; スタック: 書き出すファイル
  Exch $R9
  Push $0
  Push $9
  StrCpy $0 "0"
  ${If} ${Silent}
    StrCpy $0 "1"
  ${EndIf}
  ClearErrors
  FileOpen $9 $R9 w
  ${IfNot} ${Errors}
    FileWrite $9 "version=${VERSION}$\r$\n"
    FileWrite $9 "osBuild=$OsBuild$\r$\n"
    FileWrite $9 "osType=$OsType$\r$\n"
    FileWrite $9 "arch=$Arch$\r$\n"
    FileWrite $9 "osVerdict=$OsVerdict$\r$\n"
    FileWrite $9 "webview2=$Wv2Version$\r$\n"
    FileWrite $9 "vcredist=$VcVersion$\r$\n"
    FileWrite $9 "vcredistDetail=$VcDetail$\r$\n"
    FileWrite $9 "minVcMinor=${MIN_VC_MINOR}$\r$\n"
    FileWrite $9 "silent=$0$\r$\n"
    FileWrite $9 "decisions=$Decisions$\r$\n"
    FileClose $9
  ${EndIf}
  Pop $9
  Pop $0
  Pop $R9
FunctionEnd

; ---- ランタイムの取得と導入 (同意後のみ) ------------------------------------

; 入力: $R0=表示名 $R1=取得URL $R2=保存名 $R3=導入時の引数 $R4=手動の案内URL $R5=記録用の名前
; 戻り: $R6 = installed / declined / failed
Function OfferRuntime
  StrCpy $R6 "declined"
  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 \
    "$R0 が見つかりません（または古い版です）。${APP_NAME} の起動に必要です。$\r$\n$\r$\nMicrosoft 公式の配布元からダウンロードして導入しますか？$\r$\n  取得元: $R1$\r$\n  導入前に Microsoft の署名を確認します。管理者の確認が出ることがあります。$\r$\n$\r$\n「いいえ」を選ぶと導入せずに続けます。あとで次の公式ページから導入できます。$\r$\n  $R4" \
    /SD IDNO IDYES offer_fetch
  Goto offer_done
  offer_fetch:
  DetailPrint "$R0 を取得しています: $R1"
  nsExec::ExecToStack '"${POWERSHELL}" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\fetch-runtime.ps1" -Url "$R1" -Out "$PLUGINSDIR\$R2"'
  Pop $0
  Pop $1
  DetailPrint "取得の結果: $0 $1"
  ${If} $0 != 0
    StrCpy $R6 "failed"
    MessageBox MB_OK|MB_ICONEXCLAMATION "$R0 を取得・確認できませんでした（$1）。$\r$\nインターネット接続を確かめるか、次の公式ページから手動で導入してください。$\r$\n  $R4" /SD IDOK
    Goto offer_done
  ${EndIf}
  DetailPrint "$R0 を導入しています"
  ExecShellWait "open" "$PLUGINSDIR\$R2" "$R3"
  StrCpy $R6 "installed"
  offer_done:
FunctionEnd

Function CheckRuntimes
  Call DetectWebView2
  ${If} $Wv2Version == ""
    StrCpy $R0 "WebView2 ランタイム"
    StrCpy $R1 "${WV2_URL}"
    StrCpy $R2 "MicrosoftEdgeWebview2Setup.exe"
    StrCpy $R3 "/silent /install"
    StrCpy $R4 "${WV2_HELP}"
    Call OfferRuntime
    StrCpy $Decisions "$Decisions webview2:$R6"
    ${If} $R6 == "installed"
      Call DetectWebView2
    ${EndIf}
  ${EndIf}
  Call DetectVcRedist
  ${If} $VcVersion == ""
    StrCpy $R0 "Microsoft Visual C++ v14 Redistributable (x64)"
    StrCpy $R1 "${VC_URL}"
    StrCpy $R2 "vc_redist.x64.exe"
    StrCpy $R3 "/install /passive /norestart"
    StrCpy $R4 "${VC_HELP}"
    Call OfferRuntime
    StrCpy $Decisions "$Decisions vcredist:$R6"
    ${If} $R6 == "installed"
      Call DetectVcRedist
    ${EndIf}
  ${EndIf}
  StrCpy $RuntimeMissing ""
  ${If} $Wv2Version == ""
    StrCpy $RuntimeMissing "$RuntimeMissing$\r$\n  WebView2 ランタイム: ${WV2_HELP}"
  ${EndIf}
  ${If} $VcVersion == ""
    StrCpy $RuntimeMissing "$RuntimeMissing$\r$\n  Visual C++ v14 Redistributable (x64): ${VC_HELP}"
  ${EndIf}
  ${If} $RuntimeMissing != ""
    StrCpy $Decisions "$Decisions runtime:missing"
    MessageBox MB_OK|MB_ICONEXCLAMATION "次のランタイムがないため、このままでは ${APP_NAME} を起動できません。$\r$\nアプリのファイルは導入します。起動する前に、公式ページから導入してください。$RuntimeMissing" /SD IDOK
  ${EndIf}
FunctionEnd

; ---- 起動中の確認 ----------------------------------------------------------

; 実行中の一覧に recooplay-desktop.exe / recooplay-host.exe があるか。find は見つかると終了コード0を返す
; (tasklist の案内文は地域の言語で変わるので、出力の形には頼らない)。名前の一部で探すと、
; インストーラー自身 (ReCooplay-...-setup.exe) に一致するため、exe名で絞ってから正確な名前を探す
!macro CheckNotRunning UN
Function ${UN}CheckNotRunning
  running_retry:
  nsExec::ExecToStack '"$SYSDIR\cmd.exe" /d /c tasklist /NH /FO CSV /FI "IMAGENAME eq recooplay-desktop.exe" | find /I "recooplay-desktop.exe"'
  Pop $0
  Pop $1
  nsExec::ExecToStack '"$SYSDIR\cmd.exe" /d /c tasklist /NH /FO CSV /FI "IMAGENAME eq recooplay-host.exe" | find /I "recooplay-host.exe"'
  Pop $2
  Pop $1
  ${If} $0 == 0
  ${OrIf} $2 == 0
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "${APP_NAME}（recooplay-desktop.exe / recooplay-host.exe）が起動しています。$\r$\nアプリを閉じてから「再試行」を押してください。" /SD IDCANCEL IDRETRY running_retry
    SetErrorLevel 3
    Quit
  ${EndIf}
FunctionEnd
!macroend
!insertmacro CheckNotRunning ""
!insertmacro CheckNotRunning "un."

; ---- 導入 ------------------------------------------------------------------

Function .onInit
  InitPluginsDir
  ${GetParameters} $R0
  StrCpy $SimWv2 0
  StrCpy $SimVc 0
  ClearErrors
  ${GetOptions} $R0 "/SIMULATE_MISSING_WEBVIEW2" $1
  ${IfNot} ${Errors}
    StrCpy $SimWv2 1
  ${EndIf}
  ClearErrors
  ${GetOptions} $R0 "/SIMULATE_MISSING_VCREDIST" $1
  ${IfNot} ${Errors}
    StrCpy $SimVc 1
  ${EndIf}
  Call DetectOs
  Call DetectWebView2
  Call DetectVcRedist

  ClearErrors
  ${GetOptions} $R0 "/REPORT=" $R1
  ${IfNot} ${Errors}
    StrCpy $Decisions "report-only"
    Push $R1
    Call WriteReportTo
    SetErrorLevel 0
    Quit
  ${EndIf}

  ${If} $OsVerdict == "blocked"
    MessageBox MB_OK|MB_ICONSTOP "このPCでは ${APP_NAME} を動かせません。$\r$\n  Windows のビルド: $OsBuild（$OsType） / CPU: $Arch$\r$\n$\r$\n${APP_NAME} は 64bit (x64) 版の Windows 11 を正式にサポートしています。$\r$\n32bit 版の Windows、Windows 10 の ARM64 版、Windows 10 1809 より古い Windows では動きません。" /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
  ${If} $OsVerdict == "unsupported"
    ; 技術的には動く条件を満たすので、利用者が選べば続ける。サイレントでは保証外を記録して続ける
    MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "このPCは動作保証の対象外です。$\r$\n  Windows のビルド: $OsBuild（$OsType） / CPU: $Arch$\r$\n$\r$\n${APP_NAME} が正式にサポートしているのは、64bit (x64) 版の Windows 11 だけです。$\r$\nこのPCでも動く条件は満たしていますが、動作は確認していません。$\r$\n$\r$\n保証外のまま導入を続けますか？" /SD IDYES IDYES init_continue
    SetErrorLevel 2
    Quit
  ${EndIf}
  init_continue:
  Call CheckNotRunning
FunctionEnd

Section "Re:Cooplay" SecMain
  SectionIn RO
  ${If} $OsVerdict == "unsupported"
    StrCpy $Decisions "$Decisions os:unsupported-continued"
  ${EndIf}
  File "/oname=$PLUGINSDIR\fetch-runtime.ps1" "fetch-runtime.ps1"
  Call CheckRuntimes

  SetOutPath "$INSTDIR"
  ; 上書き更新のとき、前の版の画面 (名前に版のハッシュを含む) が残らないようにする。
  ; 自分が入れたフォルダ (配布の照合ファイルがある) のときだけ消す
  ${If} ${FileExists} "$INSTDIR\package-manifest.json"
    RMDir /r "$INSTDIR\apps\web\dist"
    RMDir /r "$INSTDIR\apps\game-profiles"
  ${EndIf}
  File /r "${SRC}\*.*"
  WriteUninstaller "$INSTDIR\uninstall.exe"

  CreateShortcut "$SMPROGRAMS\${APP_KEY}.lnk" "$INSTDIR\recooplay-desktop.exe" "" "$INSTDIR\recooplay-desktop.exe" 0

  WriteRegStr HKCU "${SETTINGS_KEY}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "Re:Cooplay (JPHACKS kz_2613)"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\recooplay-desktop.exe"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKCU "${UNINST_KEY}" "QuietUninstallString" '"$INSTDIR\uninstall.exe" /S'
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  WriteRegDWORD HKCU "${UNINST_KEY}" "EstimatedSize" $0

  Call OfferFirewall
  Push "$INSTDIR\install-report.txt"
  Call WriteReportTo
SectionEnd

; ファイアウォールの受信許可は初期OFF。同意したときだけ、管理者の確認を経て最小限 (ローカルサブネットのみ) を追加する
Function OfferFirewall
  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 \
    "スマホから接続できるように、Windows ファイアウォールに受信の許可を追加しますか？（任意）$\r$\n$\r$\n  対象: recooplay-host.exe の UDP と TCP 8080$\r$\n  相手: 同じネットワーク（ローカルサブネット）だけ$\r$\n  管理者の確認が出ます。アンインストール時に削除するか尋ねます。$\r$\n$\r$\n接続できないときの原因はファイアウォールとは限りません。あとから README.txt の手順でも追加できます。" \
    /SD IDNO IDYES fw_add
  StrCpy $Decisions "$Decisions firewall:declined"
  Return
  fw_add:
  ExecShellWait "runas" "${POWERSHELL}" '-NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\allow-firewall.ps1" -Program "$INSTDIR\recooplay-host.exe"' SW_HIDE
  nsExec::ExecToStack `"${POWERSHELL}" -NoProfile -NonInteractive -Command "if (Get-NetFirewallRule -DisplayName 'Re:Cooplay test*' -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"`
  Pop $0
  Pop $1
  ${If} $0 == 0
    WriteRegDWORD HKCU "${SETTINGS_KEY}" "FirewallRule" 1
    StrCpy $Decisions "$Decisions firewall:added"
  ${Else}
    StrCpy $Decisions "$Decisions firewall:not-added"
    MessageBox MB_OK|MB_ICONINFORMATION "ファイアウォールの許可は追加されませんでした（管理者の確認を取り消した可能性があります）。$\r$\n必要になったら README.txt の手順で追加できます。" /SD IDOK
  ${EndIf}
FunctionEnd

Function CreateDesktopShortcut
  CreateShortcut "$DESKTOP\${APP_KEY}.lnk" "$INSTDIR\recooplay-desktop.exe" "" "$INSTDIR\recooplay-desktop.exe" 0
FunctionEnd

Function FinishPageShow
  ; ランタイムが足りないときは、起動して失敗させないよう「起動する」を外しておく
  ${If} $RuntimeMissing != ""
    SendMessage $mui.FinishPage.Run ${BM_SETCHECK} ${BST_UNCHECKED} 0
  ${EndIf}
FunctionEnd

; ---- アンインストール ------------------------------------------------------

Function un.onInit
  Call un.CheckNotRunning
FunctionEnd

Section "Uninstall"
  ; 自分が入れたファイルだけを消す。利用者が選んだフォルダごと消すことはしない
  Delete "$INSTDIR\recooplay-desktop.exe"
  Delete "$INSTDIR\recooplay-host.exe"
  Delete "$INSTDIR\config.example.json"
  Delete "$INSTDIR\allow-firewall.ps1"
  Delete "$INSTDIR\LICENSE"
  Delete "$INSTDIR\README.txt"
  Delete "$INSTDIR\package-manifest.json"
  Delete "$INSTDIR\install-report.txt"
  RMDir /r "$INSTDIR\apps\web\dist"
  RMDir /r "$INSTDIR\apps\game-profiles"
  RMDir "$INSTDIR\apps\web"
  RMDir "$INSTDIR\apps"
  Delete "$SMPROGRAMS\${APP_KEY}.lnk"
  Delete "$DESKTOP\${APP_KEY}.lnk"

  ; 利用者のデータ (設定・ログ・手動登録したゲーム) は初期値で残す
  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 \
    "設定とログも削除しますか？$\r$\n  $INSTDIR\config.json$\r$\n  $INSTDIR\logs$\r$\n  $LOCALAPPDATA\Re-Cooplay（手動で登録したゲーム）$\r$\n$\r$\n「いいえ」を選ぶと残します。" \
    /SD IDNO IDYES un_delete_data
  Goto un_keep_data
  un_delete_data:
  Delete "$INSTDIR\config.json"
  RMDir /r "$INSTDIR\logs"
  RMDir /r "$LOCALAPPDATA\Re-Cooplay"
  un_keep_data:

  ; インストーラーで追加したファイアウォールの許可は、同意を得て管理者の確認を経て削除する
  ReadRegDWORD $0 HKCU "${SETTINGS_KEY}" "FirewallRule"
  ${If} $0 == 1
    MessageBox MB_YESNO|MB_ICONQUESTION "インストール時に追加した Windows ファイアウォールの受信許可（Re:Cooplay test）を削除しますか？$\r$\n管理者の確認が出ます。" /SD IDNO IDNO un_fw_done
    ExecShellWait "runas" "${POWERSHELL}" `-NoProfile -NonInteractive -Command "Remove-NetFirewallRule -DisplayName 'Re:Cooplay test*' -ErrorAction SilentlyContinue"` SW_HIDE
  ${EndIf}
  un_fw_done:

  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "${UNINST_KEY}"
  DeleteRegKey HKCU "${SETTINGS_KEY}"
SectionEnd
