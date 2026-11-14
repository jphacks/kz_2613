// Unity の旧 Input Manager (#483)。<Game>_Data/globalgamemanagers の InputManager の軸 (m_Axes) を読む。
// 型情報 (TypeTree) がなくても読めるよう、軸 1 つ分の並びを手がかりに探す：
//   文字列 7 つ (名前・説明・負の説明・負のキー・正のキー・予備の負・予備の正。長さ i32 + 本体、4 バイト境界にそろえる)、
//   f32 3 つ (gravity・dead・sensitivity)、u8 2 つ (snap・invert) + 詰め物 2 バイト、i32 3 つ (type・axis・joyNum)。
// type 0 = キー・マウスのボタン、1 = マウスの移動、2 = ゲームパッドの軸 (送れないので出さない)。
use std::path::Path;

use super::{button, key_name, look};
use crate::game_actions::ReadAction;

/// これより大きい globalgamemanagers は読まない
const MAX_FILE: u64 = 64_000_000;

#[derive(Clone, Debug, PartialEq)]
pub struct Axis {
    pub name: String,
    pub negative: String,
    pub positive: String,
    pub alt_negative: String,
    pub alt_positive: String,
    pub kind: i32,
    pub axis: i32,
}

pub fn read(dir: &Path) -> Option<(Vec<ReadAction>, &'static str)> {
    let data = std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .find(|p| {
            p.is_dir()
                && p.file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(|n| n.ends_with("_Data"))
        })?;
    let file = data.join("globalgamemanagers");
    if std::fs::metadata(&file).ok()?.len() > MAX_FILE {
        return None;
    }
    let bytes = std::fs::read(&file).ok()?;
    let axes = find_axes(&bytes);
    // 既定の軸しかない作品は、旧 Input Manager を使っていない (Rewired・独自の入力など) とみなす
    if !has_custom(&axes) {
        return None;
    }
    let actions = actions_from_axes(&axes);
    (!actions.is_empty()).then_some((actions, "Unity の旧 Input Manager の軸"))
}

struct Reader<'a> {
    b: &'a [u8],
    o: usize,
}

impl Reader<'_> {
    fn i32(&mut self) -> Option<i32> {
        let v = i32::from_le_bytes(self.b.get(self.o..self.o + 4)?.try_into().ok()?);
        self.o += 4;
        Some(v)
    }
    fn f32(&mut self) -> Option<f32> {
        let v = f32::from_le_bytes(self.b.get(self.o..self.o + 4)?.try_into().ok()?);
        self.o += 4;
        Some(v)
    }
    /// 長さ付きの短い ASCII の文字列 (64 バイトまで)
    fn string(&mut self) -> Option<String> {
        let n = self.i32()?;
        if !(0..=64).contains(&n) {
            return None;
        }
        let n = n as usize;
        let s = self.b.get(self.o..self.o + n)?;
        if !s.iter().all(|c| (0x20..0x7f).contains(c)) {
            return None;
        }
        self.o = (self.o + n + 3) & !3;
        String::from_utf8(s.to_vec()).ok()
    }
}

/// オフセット o から軸 1 つを読む。読めたら (軸, 次のオフセット)
fn parse_axis(b: &[u8], o: usize) -> Option<(Axis, usize)> {
    let mut r = Reader { b, o };
    let name = r.string().filter(|s| !s.is_empty())?;
    let _descriptive = r.string()?;
    let _descriptive_negative = r.string()?;
    let negative = r.string()?;
    let positive = r.string()?;
    let alt_negative = r.string()?;
    let alt_positive = r.string()?;
    for _ in 0..3 {
        let f = r.f32()?;
        if !f.is_finite() || !(0.0..=1.0e6).contains(&f) {
            return None;
        }
    }
    let flags = b.get(r.o..r.o + 4)?;
    if flags[0] > 1 || flags[1] > 1 || flags[2] != 0 || flags[3] != 0 {
        return None;
    }
    r.o += 4;
    let kind = r.i32().filter(|v| (0..=2).contains(v))?;
    let axis = r.i32().filter(|v| (0..=63).contains(v))?;
    let _joy = r.i32().filter(|v| (0..=16).contains(v))?;
    Some((
        Axis {
            name,
            negative,
            positive,
            alt_negative,
            alt_positive,
            kind,
            axis,
        },
        r.o,
    ))
}

/// ファイルの中で、軸が 2 つ以上続く並びを探し、ファイルの順にまとめる
/// (想定外の値の軸で並びが途切れても、前後の並びを拾えるように)
pub fn find_axes(b: &[u8]) -> Vec<Axis> {
    let mut all: Vec<Axis> = Vec::new();
    let mut o = 0;
    while o + 8 < b.len() {
        let mut run = Vec::new();
        let mut p = o;
        while let Some((axis, next)) = parse_axis(b, p) {
            run.push(axis);
            p = next;
        }
        if run.len() >= 2 {
            all.extend(run);
            // 見つかった並びの後ろから探し続ける
            o = p;
            continue;
        }
        o += 4;
    }
    all
}

/// Unity の新規プロジェクトに最初から入っている軸と、その既定のキー
fn untouched_default(a: &Axis) -> bool {
    matches!(
        (
            a.name.as_str(),
            a.positive.as_str(),
            a.alt_positive.as_str()
        ),
        ("Fire1", "left ctrl", "mouse 0")
            | ("Fire2", "left alt", "mouse 1")
            | ("Fire3", "left shift", "mouse 2")
            | ("Submit", "return", "joystick button 0")
            | ("Cancel", "escape", "joystick button 1")
    )
}

const DEFAULT_NAMES: [&str; 9] = [
    "Horizontal",
    "Vertical",
    "Fire1",
    "Fire2",
    "Fire3",
    "Jump",
    "Mouse X",
    "Mouse Y",
    "Mouse ScrollWheel",
];

/// Unity の描画機能 (SRP) のデバッグ画面が自動で足す軸 (遊びには使わない)
fn engine_debug(name: &str) -> bool {
    name.starts_with("Debug ") || name.starts_with("Enable Debug")
}

/// 作品が自分で足した軸があるか
pub fn has_custom(axes: &[Axis]) -> bool {
    axes.iter().any(|a| {
        a.kind == 0
            && !DEFAULT_NAMES.contains(&a.name.as_str())
            && a.name != "Submit"
            && a.name != "Cancel"
            && !engine_debug(&a.name)
    })
}

fn first_key(names: &[&str]) -> Option<&'static str> {
    names
        .iter()
        .filter(|n| !n.is_empty())
        .find_map(|n| key_name(n))
}

/// 軸から操作を作る。負・正のキーがあれば 2 つの操作に分ける。マウスの移動は視点 1 つにまとめる
pub fn actions_from_axes(axes: &[Axis]) -> Vec<ReadAction> {
    // 作品が自分で足した軸があるときは、手を付けていない既定の軸 (Fire1 など) は使っていないとみなして出さない
    let custom = has_custom(axes);
    let mut out: Vec<ReadAction> = Vec::new();
    let mut seen: Vec<&str> = Vec::new();
    for a in axes {
        if a.kind == 1 {
            if a.axis <= 1 && !out.iter().any(|x| x.kind == "mouseDelta") {
                out.push(look("unity/look", "視点"));
            }
            continue;
        }
        if a.kind != 0
            || seen.contains(&a.name.as_str())
            || (custom && untouched_default(a))
            || engine_debug(&a.name)
        {
            continue;
        }
        let pos = first_key(&[&a.positive, &a.alt_positive]);
        let neg = first_key(&[&a.negative, &a.alt_negative]);
        if pos.is_none() && neg.is_none() {
            continue;
        }
        seen.push(&a.name);
        let lower = a.name.to_ascii_lowercase();
        let (n_word, p_word) = if lower.contains("horiz") {
            ("left", "right")
        } else if lower.contains("vert") {
            ("down", "up")
        } else {
            ("negative", "positive")
        };
        if neg.is_some() {
            out.push(button(
                format!("unity/{}/{n_word}", a.name),
                format!("{} {n_word}", a.name),
                neg,
            ));
            out.push(button(
                format!("unity/{}/{p_word}", a.name),
                format!("{} {p_word}", a.name),
                pos,
            ));
        } else if !out.iter().any(|x| x.default.is_some() && x.default == pos) {
            // 先に出した操作と同じキーだけの軸 (MouseButton0 など、同じボタンの別名) は出さない
            out.push(button(format!("unity/{}", a.name), a.name.clone(), pos));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(out: &mut Vec<u8>, v: &str) {
        out.extend((v.len() as i32).to_le_bytes());
        out.extend(v.as_bytes());
        while !out.len().is_multiple_of(4) {
            out.push(0);
        }
    }

    fn axis(out: &mut Vec<u8>, name: &str, keys: [&str; 4], kind: i32, ax: i32) {
        s(out, name);
        s(out, "");
        s(out, "");
        for k in keys {
            s(out, k);
        }
        for f in [3.0f32, 0.001, 3.0] {
            out.extend(f.to_le_bytes());
        }
        out.extend([1, 0, 0, 0]);
        for v in [kind, ax, 0] {
            out.extend(v.to_le_bytes());
        }
    }

    fn manager(custom: bool) -> Vec<u8> {
        let mut b = vec![0xAB; 37];
        while !b.len().is_multiple_of(4) {
            b.push(0);
        }
        b.extend(8i32.to_le_bytes());
        axis(&mut b, "Horizontal", ["left", "right", "a", "d"], 0, 0);
        axis(&mut b, "Vertical", ["down", "up", "s", "w"], 0, 0);
        axis(&mut b, "Fire1", ["", "left ctrl", "", "mouse 0"], 0, 0);
        axis(
            &mut b,
            if custom { "Attack" } else { "Jump" },
            ["", "mouse 0", "", "joystick button 0"],
            0,
            0,
        );
        axis(&mut b, "Mouse X", ["", "", "", ""], 1, 0);
        axis(&mut b, "Mouse Y", ["", "", "", ""], 1, 1);
        if custom {
            axis(&mut b, "MouseButton0", ["", "mouse 0", "", ""], 0, 0);
        }
        axis(&mut b, "Horizontal", ["", "", "", ""], 2, 0);
        b.extend([0u8; 16]);
        b
    }

    #[test]
    fn finds_axes_without_type_tree() {
        let axes = find_axes(&manager(true));
        assert_eq!(axes.len(), 8);
        assert_eq!(axes[0].name, "Horizontal");
        assert_eq!(axes[0].alt_positive, "d");
        assert_eq!(axes[7].kind, 2);
    }

    #[test]
    fn axes_become_actions() {
        let a = actions_from_axes(&find_axes(&manager(true)));
        let ids: Vec<&str> = a.iter().map(|a| a.id.as_str()).collect();
        assert_eq!(
            ids,
            [
                "unity/Horizontal/left",
                "unity/Horizontal/right",
                "unity/Vertical/down",
                "unity/Vertical/up",
                "unity/Attack",
                "unity/look"
            ],
            "手を付けていない Fire1・同じキーの別名 (MouseButton0)・ゲームパッドの軸は出さない"
        );
        assert_eq!(a[0].default, Some("ARROW_LEFT"));
        assert_eq!(a[4].default, Some("MOUSE_L"));
        // 既定の軸しかない作品は読まない (read が None)。操作にするなら Fire1 も出す
        assert!(!has_custom(&find_axes(&manager(false))));
        let a = actions_from_axes(&find_axes(&manager(false)));
        assert!(a
            .iter()
            .any(|a| a.id == "unity/Fire1" && a.default == Some("LCTRL")));
    }

    #[test]
    fn random_bytes_have_no_axes() {
        let b: Vec<u8> = (0..20_000u32)
            .map(|i| (i.wrapping_mul(2_654_435_761) >> 13) as u8)
            .collect();
        assert!(find_axes(&b).is_empty());
    }
}
