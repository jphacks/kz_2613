// ゲームエンジンごとの、操作の読み取り (#481)。game_actions::read が Unity Input System・.NET の次に試す。
// 決まりは game_actions と同じ：ゲームを起動しない・コードを実行しない・ファイルを書き換えない・外部へ送らない・
// 暗号化されたデータは読まない。読めなければ None を返し、呼び出し側は汎用定義に戻る。
//
// 利用者のキー設定ファイル (Source 2 の .vcfg、Bethesda の ControlMap_Custom.txt など) を読めたときは、
// その時点のキーを初期キーにする (仮の定義は「作り直す」で読み直す)。
use std::path::Path;

use crate::game_actions::{ReadAction, MAX_ACTIONS};
use crate::keybinds::{name_key, Key};

pub mod ba2;
pub mod creation;
pub mod cryengine;
pub mod factorio;
pub mod generic2d;
pub mod giants;
pub mod godot;
pub mod prism3d;
pub mod quake;
pub mod redengine;
pub mod rpgmaker;
pub mod source2;
pub mod unity_legacy;
pub mod unity_prefs;
pub mod unreal;
pub mod wolf;
pub mod zip;
pub mod zomboid;

/// 読み取りの結果 (操作, 読んだ形式の説明)
pub type Found = (Vec<ReadAction>, &'static str);

/// これより大きいテキストのファイルは読まない (設定・スクリプトは数 MB 以内)
const MAX_TEXT: u64 = 20_000_000;

/// Unity 以外のエンジンを、見分けのつきやすい順に試す。読めたら (操作, 読んだ形式の説明)
pub fn read(dir: &Path) -> Option<Found> {
    // Unity の旧 Input Manager (unity_legacy) と PlayerPrefs (unity_prefs) は、Rewired との順番があるので
    // game_actions::read から直接呼ぶ
    // generic2d (読み取りなしの 2D 向けの割当) は、ほかのどれにも当たらないときだけ
    let readers: [fn(&Path) -> Option<Found>; 14] = [
        rpgmaker::read,
        wolf::read,
        source2::read,
        creation::read,
        redengine::read,
        prism3d::read,
        giants::read,
        factorio::read,
        zomboid::read,
        godot::read,
        unreal::read,
        cryengine::read,
        quake::read,
        generic2d::read,
    ];
    readers.iter().find_map(|r| {
        r(dir)
            .map(|(mut a, s)| {
                a.truncate(MAX_ACTIONS);
                (a, s)
            })
            .filter(|(a, _)| !a.is_empty())
    })
}

/// 小さなテキストのファイルを読む (大きすぎる・読めない・UTF-8 でないものは None。BOM は外す)
pub fn read_text(path: &Path) -> Option<String> {
    if std::fs::metadata(path).ok()?.len() > MAX_TEXT {
        return None;
    }
    let bytes = std::fs::read(path).ok()?;
    let text = String::from_utf8_lossy(&bytes).into_owned();
    Some(text.trim_start_matches('\u{feff}').to_string())
}

/// キー名 → 出力 ID (keybinds::name_key に、エンジンでよく使う表記を足したもの)
pub fn key_name(name: &str) -> Option<&'static str> {
    let n = name.trim().to_ascii_lowercase();
    let extra = match n.as_str() {
        // Unity の旧 Input Manager は 0 始まり (mouse 0 = 左)。Source の MOUSE1 (= 左) は name_key に任せる
        "mouse 0" | "lmb" => Some("MOUSE_L"),
        "mouse 1" | "rmb" => Some("MOUSE_R"),
        // mouse 2 以降 (中ボタンなど) は送れない
        n if n.starts_with("mouse ") => return None,
        "uparrow" | "up arrow" => Some("ARROW_UP"),
        "downarrow" | "down arrow" => Some("ARROW_DOWN"),
        "leftarrow" | "left arrow" => Some("ARROW_LEFT"),
        "rightarrow" | "right arrow" => Some("ARROW_RIGHT"),
        _ => None,
    };
    if extra.is_some() {
        return extra;
    }
    match name_key(name) {
        Key::Output(k) => Some(k),
        _ => None,
    }
}

/// ブラウザ・Windows の仮想キーコード (keyCode / VK_*) → 出力 ID。テンキーなど送れないキーは None
pub fn vk_key(code: u32) -> Option<&'static str> {
    let named = match code {
        8 => "BACKSPACE",
        9 => "TAB",
        13 => "ENTER",
        16 => "LSHIFT",
        17 => "LCTRL",
        18 => "LALT",
        20 => "CAPS_LOCK",
        27 => "ESC",
        32 => "SPACE",
        33 => "PAGE_UP",
        34 => "PAGE_DOWN",
        35 => "END",
        36 => "HOME",
        37 => "ARROW_LEFT",
        38 => "ARROW_UP",
        39 => "ARROW_RIGHT",
        40 => "ARROW_DOWN",
        45 => "INSERT",
        46 => "DELETE",
        _ => "",
    };
    if !named.is_empty() {
        return crate::controls::output(named).map(|o| o.id);
    }
    let name = match code {
        48..=57 => char::from(code as u8).to_string(),
        65..=90 => char::from(code as u8).to_ascii_lowercase().to_string(),
        112..=123 => format!("f{}", code - 111),
        _ => return None,
    };
    key_name(&name)
}

/// DirectInput のキーコード (DIK_*、0x80 以上は拡張キー) → 出力 ID
pub fn dik_key(code: u32) -> Option<&'static str> {
    if code == 0 || code > 0xff {
        return None;
    }
    let (scan, ext) = if code >= 0x80 {
        ((code - 0x80) as u16, true)
    } else {
        (code as u16, false)
    };
    crate::controls::output_by_scan(scan, ext).map(|o| o.id)
}

/// 操作を 1 つ作る
pub fn button(
    id: impl Into<String>,
    label: impl Into<String>,
    key: Option<&'static str>,
) -> ReadAction {
    ReadAction {
        id: id.into(),
        label: label.into(),
        kind: "button",
        default: key,
        group: None,
    }
}

/// 読み取り側が意味を知っている操作に、分類の手がかりを付ける (モデルの分類より優先する、#512)
pub fn in_group(mut a: ReadAction, group: &'static str) -> ReadAction {
    a.group = Some(group);
    a
}

/// マウスの移動 (視点) の操作
pub fn look(id: impl Into<String>, label: impl Into<String>) -> ReadAction {
    ReadAction {
        id: id.into(),
        label: label.into(),
        kind: "mouseDelta",
        default: None,
        group: None,
    }
}

/// ディレクトリの中に、名前が条件に合うファイルがあるか (大文字と小文字を区別しない)
pub fn has_file(dir: &Path, pred: impl Fn(&str) -> bool) -> bool {
    std::fs::read_dir(dir).is_ok_and(|rd| {
        rd.flatten().any(|e| {
            e.path().is_file()
                && e.file_name()
                    .to_str()
                    .is_some_and(|n| pred(&n.to_ascii_lowercase()))
        })
    })
}

/// 大文字と小文字を区別せずに、子の名前を探す
pub fn child_ci(dir: &Path, name: &str) -> Option<std::path::PathBuf> {
    let want = name.to_ascii_lowercase();
    std::fs::read_dir(dir).ok()?.flatten().find_map(|e| {
        e.file_name()
            .to_str()
            .filter(|n| n.to_ascii_lowercase() == want)
            .map(|_| e.path())
    })
}

/// 仮の定義の元にした、利用者のキー設定のファイル (#524)。ゲームの中でキーを変えたら更新日時が変わるので、読み直しの目安にする。
/// ゲーム本体のファイル (ツクールの rpg_core.js など) は対象外
pub fn user_config(dir: &Path) -> Option<std::path::PathBuf> {
    let finders: [fn(&Path) -> Option<std::path::PathBuf>; 9] = [
        source2::user_config,
        creation::user_config,
        redengine::user_config,
        prism3d::user_config,
        giants::user_config,
        factorio::user_config,
        zomboid::user_config,
        unreal::user_config,
        quake::user_config,
    ];
    finders.iter().find_map(|f| f(dir))
}

/// 利用者のキー設定のファイルの更新日時 (UNIX 時刻の秒)。ファイルがなければ None
pub fn config_modified(dir: &Path) -> Option<u64> {
    let t = std::fs::metadata(user_config(dir)?).ok()?.modified().ok()?;
    t.duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|d| d.as_secs())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn key_codes_map_to_outputs() {
        assert_eq!(vk_key(13), Some("ENTER"));
        assert_eq!(vk_key(90), Some("KEY_Z"));
        assert_eq!(vk_key(49), Some("DIGIT_1"));
        assert_eq!(vk_key(37), Some("ARROW_LEFT"));
        assert_eq!(vk_key(120), Some("F9"));
        assert_eq!(vk_key(96), None, "テンキーは送れない");
        assert_eq!(dik_key(0x11), Some("KEY_W"));
        assert_eq!(dik_key(0xc8), Some("ARROW_UP"), "0x80 以上は拡張キー");
        assert_eq!(dik_key(0), None);
        assert_eq!(key_name("mouse 0"), Some("MOUSE_L"));
        assert_eq!(
            key_name("mouse 2"),
            None,
            "Unity の中ボタンを右クリックにしない"
        );
        assert_eq!(key_name("MOUSE2"), Some("MOUSE_R"), "Source の MOUSE2 は右");
        assert_eq!(key_name("left shift"), Some("LSHIFT"));
    }
}
