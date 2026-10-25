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
}

impl Default for Target {
    fn default() -> Self {
        // Minecraft Java Edition は javaw.exe (ランチャーの設定によっては java.exe) で動き、タイトルに "Minecraft" を含む
        Target { processes: vec!["javaw.exe".into(), "java.exe".into()], title_contains: "Minecraft".into(), dir: None }
    }
}

/// 比べるためにパスをそろえる (区切りを \ に、小文字に)
fn norm(path: &str) -> String {
    path.replace('/', "\\").to_lowercase()
}

impl Target {
    /// インストール先のフォルダ内のプロセスを入力先にする
    pub fn install_dir(dir: &Path) -> Target {
        let mut d = norm(&dir.to_string_lossy()).trim_end_matches('\\').to_string();
        d.push('\\');
        Target { processes: vec![], title_contains: String::new(), dir: Some(d) }
    }

    pub fn matches(&self, fg: &Foreground) -> bool {
        if let Some(dir) = &self.dir {
            return norm(&fg.path).starts_with(dir.as_str());
        }
        let process_ok = self.processes.iter().any(|p| p.eq_ignore_ascii_case(&fg.process));
        let title_ok = fg.title.to_lowercase().contains(&self.title_contains.to_lowercase());
        process_ok && title_ok
    }

    pub fn describe(&self) -> String {
        match &self.dir {
            Some(dir) => format!("{dir} 内のプログラム"),
            None => format!("{}（タイトルに「{}」）", self.processes.join(" / "), self.title_contains),
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
            let path = path.to_lowercase();
            let process = path.rsplit(['\\', '/']).next().unwrap_or("").to_string();
            Some(Foreground { process, path, title: String::from_utf16_lossy(&title[..n]) })
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

    pub fn find(target: &super::Target) -> Option<HWND> {
        let mut search = Search { target, found: None };
        unsafe { let _ = EnumWindows(Some(visit), LPARAM(&mut search as *mut _ as isize)); }
        search.found
    }

    pub fn activate(target: &super::Target) -> Result<(), String> {
        let hwnd = find(target).ok_or("起動済みのゲームのウィンドウが見つかりません")?;
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
        Foreground { process: process.into(), path: format!(r"c:\program files\java\bin\{process}").to_lowercase(), title: title.into() }
    }

    #[test]
    fn install_dir_target_matches_only_inside_the_folder() {
        let t = Target::install_dir(Path::new(r"D:\SteamLibrary\steamapps\common\Stardew Valley"));
        let at = |path: &str| Foreground {
            process: path.rsplit('\\').next().unwrap().to_lowercase(),
            path: path.to_lowercase(),
            title: String::new(),
        };
        assert!(t.matches(&at(r"D:\SteamLibrary\steamapps\common\Stardew Valley\Stardew Valley.exe")));
        assert!(t.matches(&at(r"d:\steamlibrary\steamapps\common\stardew valley\bin\game.exe")));
        // 名前が前方一致するだけの別フォルダ・ランチャー本体は対象外
        assert!(!t.matches(&at(r"D:\SteamLibrary\steamapps\common\Stardew Valley 2\game.exe")));
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
