// 前面のウィンドウが入力先のゲーム (Minecraft Java Edition、または一覧で選んだゲーム) かを確認する。
// SendInput は前面のウィンドウへ届くので、常時 ON (on) モードでも前面が対象のときだけ注入する (FR-034)。

use std::path::Path;

/// 前面のウィンドウ: プロセスの実行ファイル名 (小文字)・実行ファイルの場所 (小文字) とタイトル
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Foreground {
    pub process: String,
    pub path: String,
    pub title: String,
}

/// 入力先の条件 (config.json の "target" で変更可)。
/// dir があるとき (一覧で選んだゲーム) は、そのフォルダ内の実行ファイルのウィンドウだけを入力先とする
#[derive(Clone)]
pub struct Target {
    pub processes: Vec<String>,
    pub title_contains: String,
    pub dir: Option<String>,
    /// 手動登録した実行ファイル。共有フォルダー内の別プログラムを入力先にしない。
    pub executable: Option<String>,
}

impl Default for Target {
    fn default() -> Self {
        // Minecraft Java Edition は javaw.exe (ランチャーの設定によっては java.exe) で動き、タイトルに "Minecraft" を含む
        Target {
            processes: vec!["javaw.exe".into(), "java.exe".into()],
            title_contains: "Minecraft".into(),
            dir: None,
            executable: None,
        }
    }
}

/// 比べるためにパスをそろえる (区切りを \ に、小文字に)
fn norm(path: &str) -> String {
    let path = path.replace('/', "\\").to_lowercase();
    if let Some(rest) = path.strip_prefix(r"\\?\unc\") {
        format!(r"\\{rest}")
    } else {
        path.strip_prefix(r"\\?\").unwrap_or(&path).to_string()
    }
}

impl Target {
    /// インストール先のフォルダ内のプロセスを入力先にする
    pub fn install_dir(dir: &Path) -> Target {
        let mut d = norm(&dir.to_string_lossy())
            .trim_end_matches('\\')
            .to_string();
        d.push('\\');
        Target {
            processes: vec![],
            title_contains: String::new(),
            dir: Some(d),
            executable: None,
        }
    }

    pub fn executable(exe: &Path) -> Target {
        let path = std::fs::canonicalize(exe).unwrap_or_else(|_| exe.to_path_buf());
        Target {
            processes: vec![],
            title_contains: String::new(),
            dir: None,
            executable: Some(norm(&path.to_string_lossy())),
        }
    }

    pub fn matches(&self, fg: &Foreground) -> bool {
        if let Some(executable) = &self.executable {
            return norm(&fg.path) == *executable;
        }
        if let Some(dir) = &self.dir {
            return norm(&fg.path).starts_with(dir.as_str());
        }
        let process_ok = self
            .processes
            .iter()
            .any(|p| p.eq_ignore_ascii_case(&fg.process));
        let title_ok = fg
            .title
            .to_lowercase()
            .contains(&self.title_contains.to_lowercase());
        process_ok && title_ok
    }

    pub fn describe(&self) -> String {
        if self.executable.is_some() {
            return "手動登録した実行ファイル".into();
        }
        match &self.dir {
            Some(dir) => format!("{dir} 内のプログラム"),
            None => format!(
                "{}（タイトルに「{}」）",
                self.processes.join(" / "),
                self.title_contains
            ),
        }
    }
}

pub fn foreground() -> Option<Foreground> {
    imp::foreground()
}

/// 許可された既存ゲームだけを前面にする。任意のパスの起動は受け付けない。
pub fn activate(target: &Target) -> Result<(), String> {
    imp::activate(target)
}

/// 入力先のウィンドウが開いているか (起動の見届けに使う)
pub fn exists(target: &Target) -> bool {
    imp::find(target).is_some()
}

/// ゲームを終了した結果 (#547)
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CloseOutcome {
    /// 対象のゲームのウィンドウがもうなかった
    NotRunning,
    /// 閉じる要求 (WM_CLOSE) で終了した
    Closed,
}

/// 選んだゲームを終了する (#547)。入力先と一致する本体のウィンドウを持つプロセスだけを対象にする。
/// 閉じる要求を送り、grace のあいだ終わるのを待つ。終わらなくても強制終了はしない
/// (Minecraft は閉じるときにワールドを保存するので、途中で止めると壊れるおそれがある)。
/// 対象を特定できなければ何も終了しない (推測で終了しない)
pub fn close(target: &Target, grace: std::time::Duration) -> Result<CloseOutcome, String> {
    imp::close(target, grace)
}

#[cfg(windows)]
mod imp {
    use windows::core::{BOOL, PWSTR};
    use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM};
    use windows::Win32::Foundation::{HANDLE, WPARAM};
    use windows::Win32::System::Threading::{
        AttachThreadInput, GetCurrentThreadId, GetExitCodeProcess, OpenProcess,
        QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        BringWindowToTop, EnumWindows, GetForegroundWindow, GetWindow, GetWindowLongW,
        GetWindowTextW, GetWindowThreadProcessId, IsIconic, IsWindowVisible, PostMessageW,
        SetForegroundWindow, ShowWindow, GWL_EXSTYLE, GW_OWNER, SW_RESTORE, WM_CLOSE,
        WS_EX_TOOLWINDOW,
    };

    use super::Foreground;

    const FOCUS_CHECKS: u32 = 7;
    const FOCUS_CHECK_INTERVAL: std::time::Duration = std::time::Duration::from_millis(30);

    pub fn foreground() -> Option<Foreground> {
        describe(unsafe { GetForegroundWindow() })
    }

    fn describe(hwnd: HWND) -> Option<Foreground> {
        unsafe {
            if hwnd.is_invalid() {
                return None;
            }
            let mut title = [0u16; 512];
            let n = GetWindowTextW(hwnd, &mut title).max(0) as usize;
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid == 0 {
                return None;
            }
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut path = [0u16; 1024];
            let mut len = path.len() as u32;
            let ok = QueryFullProcessImageNameW(
                handle,
                PROCESS_NAME_WIN32,
                PWSTR(path.as_mut_ptr()),
                &mut len,
            )
            .is_ok();
            let _ = CloseHandle(handle);
            if !ok {
                return None;
            }
            let path = String::from_utf16_lossy(&path[..len as usize]);
            let path = path.to_lowercase();
            let process = path.rsplit(['\\', '/']).next().unwrap_or("").to_string();
            Some(Foreground {
                process,
                path,
                title: String::from_utf16_lossy(&title[..n]),
            })
        }
    }

    /// ゲームの本体のウィンドウか。持ち主のいる補助のウィンドウ・ツールウィンドウは前面にしても操作の画面にならない
    fn is_main(hwnd: HWND) -> bool {
        let owned = unsafe { GetWindow(hwnd, GW_OWNER) }.is_ok_and(|o| !o.is_invalid());
        let tool = unsafe { GetWindowLongW(hwnd, GWL_EXSTYLE) } as u32 & WS_EX_TOOLWINDOW.0 != 0;
        !owned && !tool
    }

    struct Search<'a> {
        target: &'a super::Target,
        found: Option<HWND>,
        fallback: Option<HWND>,
    }
    unsafe extern "system" fn visit(hwnd: HWND, param: LPARAM) -> BOOL {
        let search = unsafe { &mut *(param.0 as *mut Search<'_>) };
        if !(unsafe { IsWindowVisible(hwnd) }.as_bool()
            && describe(hwnd).is_some_and(|f| search.target.matches(&f)))
        {
            return BOOL(1);
        }
        if is_main(hwnd) {
            search.found = Some(hwnd);
            return BOOL(0);
        }
        search.fallback.get_or_insert(hwnd);
        BOOL(1)
    }

    /// 対象のウィンドウを探す。本体のウィンドウを優先し、なければ補助のウィンドウを返す
    pub fn find(target: &super::Target) -> Option<HWND> {
        let mut search = Search {
            target,
            found: None,
            fallback: None,
        };
        unsafe {
            let _ = EnumWindows(Some(visit), LPARAM(&mut search as *mut _ as isize));
        }
        search.found.or(search.fallback)
    }

    /// 前面にする。ホストは裏で動くので、Windows は SetForegroundWindow だけでは拒むことがある
    /// (PC アプリやブラウザーが前面のとき)。いまの前面のウィンドウの入力に一時的につないでから切り替える
    fn bring_to_front(hwnd: HWND) {
        unsafe {
            // 最大化・全画面のウィンドウを元の大きさに戻さないよう、元に戻すのは最小化しているときだけ
            if IsIconic(hwnd).as_bool() {
                let _ = ShowWindow(hwnd, SW_RESTORE);
            }
            let fg = GetForegroundWindow();
            let fg_thread = if fg.is_invalid() {
                0
            } else {
                GetWindowThreadProcessId(fg, None)
            };
            let me = GetCurrentThreadId();
            let attached = fg_thread != 0
                && fg_thread != me
                && AttachThreadInput(me, fg_thread, true).as_bool();
            let _ = BringWindowToTop(hwnd);
            let _ = SetForegroundWindow(hwnd);
            if attached {
                let _ = AttachThreadInput(me, fg_thread, false);
            }
        }
    }

    pub fn activate(target: &super::Target) -> Result<(), String> {
        let hwnd = find(target).ok_or("起動済みのゲームのウィンドウが見つかりません")?;
        // 列挙後にも対象を照合する。成功は前面化を実際に確認した場合だけ返す。
        if !describe(hwnd).is_some_and(|f| target.matches(&f)) {
            return Err("入力先が変わりました".into());
        }
        // 切り替えは少し遅れて反映されることがあるので、短い間だけ確かめ直し、途中で 1 回だけやり直す (最大約 0.4 秒)
        for attempt in 0..2 {
            bring_to_front(hwnd);
            for _ in 0..FOCUS_CHECKS {
                if foreground().is_some_and(|f| target.matches(&f)) {
                    return Ok(());
                }
                std::thread::sleep(FOCUS_CHECK_INTERVAL);
            }
            if attempt == 0 && !describe(hwnd).is_some_and(|f| target.matches(&f)) {
                return Err("入力先が変わりました".into());
            }
        }
        Err("Windowsが前面化を許可しませんでした".into())
    }

    // ---- ゲームの終了 (#547) ----

    /// 対象と一致する本体のウィンドウと、そのプロセス (番号・実行ファイルの場所)
    struct Matched {
        hwnd: HWND,
        pid: u32,
        path: String,
    }
    struct All<'a> {
        target: &'a super::Target,
        found: Vec<Matched>,
    }
    unsafe extern "system" fn visit_all(hwnd: HWND, param: LPARAM) -> BOOL {
        let all = unsafe { &mut *(param.0 as *mut All<'_>) };
        if unsafe { IsWindowVisible(hwnd) }.as_bool() && is_main(hwnd) {
            if let Some(f) = describe(hwnd).filter(|f| all.target.matches(f)) {
                let mut pid = 0u32;
                unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
                if pid != 0 {
                    all.found.push(Matched {
                        hwnd,
                        pid,
                        path: f.path,
                    });
                }
            }
        }
        BOOL(1)
    }
    fn find_all(target: &super::Target) -> Vec<Matched> {
        let mut all = All {
            target,
            found: Vec::new(),
        };
        unsafe {
            let _ = EnumWindows(Some(visit_all), LPARAM(&mut all as *mut _ as isize));
        }
        all.found
    }

    /// プロセスの実行ファイルの場所 (小文字)。終わっていれば None
    fn running_path(pid: u32) -> Option<String> {
        const STILL_ACTIVE: u32 = 259;
        unsafe {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut code = 0u32;
            let alive = GetExitCodeProcess(handle, &mut code).is_ok() && code == STILL_ACTIVE;
            let path = alive.then(|| image_path(handle)).flatten();
            let _ = CloseHandle(handle);
            path
        }
    }
    fn image_path(handle: HANDLE) -> Option<String> {
        let mut path = [0u16; 1024];
        let mut len = path.len() as u32;
        unsafe {
            QueryFullProcessImageNameW(
                handle,
                PROCESS_NAME_WIN32,
                PWSTR(path.as_mut_ptr()),
                &mut len,
            )
        }
        .ok()?;
        Some(String::from_utf16_lossy(&path[..len as usize]).to_lowercase())
    }

    /// 最初に照合したプロセスが、同じ実行ファイルのまま動いているもの
    fn still_running(matched: &[(u32, String)]) -> Vec<u32> {
        matched
            .iter()
            .filter(|(pid, path)| running_path(*pid).is_some_and(|now| now == *path))
            .map(|(pid, _)| *pid)
            .collect()
    }

    fn wait_exit(matched: &[(u32, String)], limit: std::time::Duration) -> bool {
        let start = std::time::Instant::now();
        loop {
            if still_running(matched).is_empty() {
                return true;
            }
            if start.elapsed() >= limit {
                return false;
            }
            std::thread::sleep(std::time::Duration::from_millis(200));
        }
    }

    pub fn close(
        target: &super::Target,
        grace: std::time::Duration,
    ) -> Result<super::CloseOutcome, String> {
        let windows = find_all(target);
        if windows.is_empty() {
            return Ok(super::CloseOutcome::NotRunning);
        }
        let me = std::process::id();
        let mut matched: Vec<(u32, String)> = windows
            .iter()
            .filter(|w| w.pid != me)
            .map(|w| (w.pid, w.path.clone()))
            .collect();
        matched.sort();
        matched.dedup();
        if matched.is_empty() {
            return Err("終了するゲームを特定できませんでした".into());
        }
        for w in windows.iter().filter(|w| w.pid != me) {
            let _ = unsafe { PostMessageW(Some(w.hwnd), WM_CLOSE, WPARAM(0), LPARAM(0)) };
        }
        if wait_exit(&matched, grace) {
            Ok(super::CloseOutcome::Closed)
        } else {
            // 保存中・確認ダイアログなどで閉じきっていない。強制終了はせず、手で閉じてもらう
            Err("ゲームがまだ閉じていません（保存中かもしれません）".into())
        }
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn activate(_: &super::Target) -> Result<(), String> {
        Err("Windows以外では前面化できません".into())
    }
    pub fn close(_: &super::Target, _: std::time::Duration) -> Result<super::CloseOutcome, String> {
        Err("Windows以外ではゲームを終了できません".into())
    }
    pub fn find(_: &super::Target) -> Option<()> {
        None
    }
    pub fn foreground() -> Option<super::Foreground> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fg(process: &str, title: &str) -> Foreground {
        Foreground {
            process: process.into(),
            path: format!(r"c:\program files\java\bin\{process}").to_lowercase(),
            title: title.into(),
        }
    }

    #[test]
    fn manual_target_matches_only_the_selected_executable() {
        let t = Target::executable(Path::new(r"C:\Windows\System32\notepad.exe"));
        let at = |path: &str| Foreground {
            process: "notepad.exe".into(),
            path: path.into(),
            title: String::new(),
        };
        // 同じフォルダーでも、別のexeは許可しない。別の場所の同名exeも許可しない。
        assert!(!t.matches(&at(r"C:\Windows\System32\cmd.exe")));
        assert!(!t.matches(&at(r"C:\Other\notepad.exe")));
        // Windowsが存在するファイルを正規化した結果に合わせて比較する。
        let selected = t.executable.as_ref().unwrap();
        assert!(t.matches(&at(selected)));
        assert!(t.matches(&at(&format!(r"\\?\{selected}"))));
        assert!(!t.describe().to_lowercase().contains("windows"));
    }

    #[test]
    fn install_dir_target_matches_only_inside_the_folder() {
        let t = Target::install_dir(Path::new(
            r"D:\SteamLibrary\steamapps\common\Stardew Valley",
        ));
        let at = |path: &str| Foreground {
            process: path.rsplit('\\').next().unwrap().to_lowercase(),
            path: path.to_lowercase(),
            title: String::new(),
        };
        assert!(t.matches(&at(
            r"D:\SteamLibrary\steamapps\common\Stardew Valley\Stardew Valley.exe"
        )));
        assert!(t.matches(&at(
            r"d:\steamlibrary\steamapps\common\stardew valley\bin\game.exe"
        )));
        // 名前が前方一致するだけの別フォルダ・ランチャー本体は対象外
        assert!(!t.matches(&at(
            r"D:\SteamLibrary\steamapps\common\Stardew Valley 2\game.exe"
        )));
        assert!(!t.matches(&at(r"C:\Program Files (x86)\Steam\steam.exe")));
    }

    #[test]
    fn minecraft_java_matches() {
        let t = Target::default();
        assert!(t.matches(&fg("javaw.exe", "Minecraft* 1.21.1")));
        assert!(t.matches(&fg("java.exe", "Minecraft 1.20.4 - Singleplayer")));
        assert!(t.matches(&fg("JAVAW.EXE", "minecraft")));
    }

    #[test]
    fn other_windows_do_not_match() {
        let t = Target::default();
        assert!(!t.matches(&fg("javaw.exe", "IntelliJ IDEA"))); // Java の別アプリ
        assert!(!t.matches(&fg("chrome.exe", "Minecraft Wiki - Google Chrome"))); // タイトルだけ一致
        assert!(!t.matches(&fg("minecraftlauncher.exe", "Minecraft Launcher"))); // ランチャー
        assert!(!t.matches(&fg("recooplay-desktop.exe", "Re:Cooplay")));
    }
}
