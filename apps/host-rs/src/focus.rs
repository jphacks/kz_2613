// 前面のウィンドウが入力先のゲーム (Minecraft Java Edition) かを確認する。
// SendInput は前面のウィンドウへ届くので、常時 ON (on) モードでも前面が対象のときだけ注入する (FR-034)。

/// 前面のウィンドウ: プロセスの実行ファイル名 (小文字) とタイトル
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Foreground {
    pub process: String,
    pub title: String,
}

/// 入力先の条件 (config.json の "target" で変更可)
pub struct Target {
    pub processes: Vec<String>,
    pub title_contains: String,
}

impl Default for Target {
    fn default() -> Self {
        // Minecraft Java Edition は javaw.exe (ランチャーの設定によっては java.exe) で動き、タイトルに "Minecraft" を含む
        Target { processes: vec!["javaw.exe".into(), "java.exe".into()], title_contains: "Minecraft".into() }
    }
}

impl Target {
    pub fn matches(&self, fg: &Foreground) -> bool {
        let process_ok = self.processes.iter().any(|p| p.eq_ignore_ascii_case(&fg.process));
        let title_ok = fg.title.to_lowercase().contains(&self.title_contains.to_lowercase());
        process_ok && title_ok
    }

    pub fn describe(&self) -> String {
        format!("{}（タイトルに「{}」）", self.processes.join(" / "), self.title_contains)
    }
}

pub fn foreground() -> Option<Foreground> {
    imp::foreground()
}

/// 許可された既存ゲームだけを前面にする。任意のパスの起動は受け付けない。
pub fn activate(target: &Target) -> Result<(), String> {
    imp::activate(target)
}

#[cfg(windows)]
mod imp {
    use windows::core::{PWSTR, BOOL};
    use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM};
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId, EnumWindows, IsWindowVisible, SetForegroundWindow, ShowWindow, SW_RESTORE};

    use super::Foreground;

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
            let ok = QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, PWSTR(path.as_mut_ptr()), &mut len).is_ok();
            let _ = CloseHandle(handle);
            if !ok {
                return None;
            }
            let path = String::from_utf16_lossy(&path[..len as usize]);
            let process = path.rsplit(['\\', '/']).next().unwrap_or("").to_lowercase();
            Some(Foreground { process, title: String::from_utf16_lossy(&title[..n]) })
        }
    }

    struct Search<'a> { target: &'a super::Target, found: Option<HWND> }
    unsafe extern "system" fn visit(hwnd: HWND, param: LPARAM) -> BOOL {
        let search = unsafe { &mut *(param.0 as *mut Search<'_>) };
        if unsafe { IsWindowVisible(hwnd) }.as_bool() && describe(hwnd).is_some_and(|f| search.target.matches(&f)) {
            search.found = Some(hwnd);
            BOOL(0)
        } else { BOOL(1) }
    }

    pub fn activate(target: &super::Target) -> Result<(), String> {
        let mut search = Search { target, found: None };
        unsafe { let _ = EnumWindows(Some(visit), LPARAM(&mut search as *mut _ as isize)); }
        let hwnd = search.found.ok_or("起動済みのMinecraftが見つかりません")?;
        // 列挙後にも対象を照合する。成功は前面化を実際に確認した場合だけ返す。
        if !describe(hwnd).is_some_and(|f| target.matches(&f)) { return Err("入力先が変わりました".into()); }
        unsafe { let _ = ShowWindow(hwnd, SW_RESTORE); let _ = SetForegroundWindow(hwnd); }
        if foreground().is_some_and(|f| target.matches(&f)) { Ok(()) }
        else { Err("Windowsが前面化を許可しませんでした".into()) }
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn activate(_: &super::Target) -> Result<(), String> { Err("Windows以外では前面化できません".into()) }
    pub fn foreground() -> Option<super::Foreground> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fg(process: &str, title: &str) -> Foreground {
        Foreground { process: process.into(), title: title.into() }
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
