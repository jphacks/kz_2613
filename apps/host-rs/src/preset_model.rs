// 人数ごとのプリセット (2〜4 人の分担) を、小さな BERT 風エンコーダの出力から作る。
// モデルはゲームの操作一覧 (名前・ID・設定名・キー・種類) をまとめて読み、操作ごとに
//   - 粗いカテゴリ (移動・視点・行動・持ち物・メニュー・会話) の確率
//   - 2 つの操作を「同じ人が持つべきか」の確率
// を出す。学習は scripts/preset-model/train.py (重みは assets/preset-model.bin、exe に埋め込む)。
// 特徴量の作り方 (featurize) は train.py と完全に同じでなければならない。
// 送ってよい操作 (担当の付くグループ) は操作定義が決め、モデルは「誰が持つか」だけを決める。

use std::collections::HashMap;
use std::sync::OnceLock;

use serde_json::Value;

use crate::profiles::Profile;

const WEIGHTS: &[u8] = include_bytes!("../assets/preset-model.bin");
const JA_SEP: &str = "・（）、。　「」()/";
const FMAX: usize = 96;

/// 粗いカテゴリの優先度 (小さいほど P1 に近い)。train.py の COARSE と同じ順
const RANK: [f32; 6] = [0.0, 1.0, 2.0, 3.0, 4.0, 5.0];
/// カテゴリどうしの「同じ人に持たせてよい度合い」(組み立ての事前知識)。
/// 行動と持ち物の切り替えは 1 人で扱いやすく、2 人なら狙い (視点) と撃つ (行動) も 1 人へ。移動と視点は別の人へ。
/// 3 人では製品の基本の分担 (P1 移動・P2 視点・P3 行動) になるよう、視点と行動より行動と持ち物を強くする
const COMPAT: [[f32; 6]; 6] = [
    // move look action item menu social
    [1.0, 0.0, 0.1, 0.1, 0.0, 0.0],
    [0.0, 1.0, 0.3, 0.2, 0.0, 0.0],
    [0.1, 0.3, 1.0, 0.6, 0.0, 0.0],
    [0.1, 0.2, 0.6, 1.0, 0.0, 0.0],
    [0.0, 0.0, 0.0, 0.0, 1.0, 0.0],
    [0.0, 0.0, 0.0, 0.0, 0.0, 1.0],
];
/// 統合のときの負担の罰則
const LAMBDA: f32 = 0.3;

/// マウスの左右のクリックの操作か
fn is_click(a: &crate::profiles::Action) -> bool {
    a.kind == "button" && matches!(a.default, Some("MOUSE_L" | "MOUSE_R"))
}
/// このカテゴリ以降 (持ち物・メニュー・会話) は、遊んでいる間ずっと手を動かす操作ではない (train.py の COARSE の順)
const LOW_ACTIVITY: usize = 3;
/// 方向の移動のキー。これを持つまとまりを P1 (ホスト) に寄せる
const DIRECTION_KEYS: [&str; 8] = [
    "KEY_W",
    "KEY_A",
    "KEY_S",
    "KEY_D",
    "ARROW_UP",
    "ARROW_DOWN",
    "ARROW_LEFT",
    "ARROW_RIGHT",
];
/// 並べるときの、方向の移動の優先 (カテゴリの順位 2 つ分。移動に購入などが混ざっても P1 にする)
const DIRECTION_BONUS: f32 = 2.0;

struct Layer {
    qkv_w: Vec<f32>,
    qkv_b: Vec<f32>,
    out_w: Vec<f32>,
    out_b: Vec<f32>,
    ln1: (Vec<f32>, Vec<f32>),
    ff1_w: Vec<f32>,
    ff1_b: Vec<f32>,
    ff2_w: Vec<f32>,
    ff2_b: Vec<f32>,
    ln2: (Vec<f32>, Vec<f32>),
}

pub struct Model {
    nb: usize,
    d: usize,
    heads: usize,
    ffn: usize,
    pair: usize,
    n_cat: usize,
    keys: Vec<String>,
    types: Vec<String>,
    text: Vec<f32>,
    key: Vec<f32>,
    typ: Vec<f32>,
    ln0: (Vec<f32>, Vec<f32>),
    layers: Vec<Layer>,
    cat_w: Vec<f32>,
    cat_b: Vec<f32>,
    pair_w: Vec<f32>,
    pair_bias: f32,
    axis_w: Vec<f32>,
    axis_bias: f32,
}

/// 1 つの操作の入力
pub struct Input<'a> {
    pub id: &'a str,
    pub label: &'a str,
    pub bind: Option<&'a str>,
    pub kind: &'a str,
    pub default: Option<&'a str>,
}

/// 推論の結果。category[i] は操作 i のカテゴリの確率、affinity[i][j] は同じ人が持つべき確率、
/// axis[i][j] は同じまとまりの中で同じ側 (方向なら縦・横の軸) にある確率
pub struct Output {
    pub category: Vec<Vec<f32>>,
    pub affinity: Vec<Vec<f32>>,
    pub axis: Vec<Vec<f32>>,
}

pub fn model() -> Option<&'static Model> {
    static M: OnceLock<Option<Model>> = OnceLock::new();
    M.get_or_init(|| match Model::load(WEIGHTS) {
        Ok(m) => Some(m),
        Err(e) => {
            log::warn!("プリセットのモデルを読めません (規則による分担に戻します): {e}");
            None
        }
    })
    .as_ref()
}

impl Model {
    pub fn load(bytes: &[u8]) -> Result<Model, String> {
        if bytes.len() < 8 || &bytes[..4] != b"RCPM" {
            return Err("形式が違います".into());
        }
        let hl = u32::from_le_bytes(bytes[4..8].try_into().unwrap()) as usize;
        let header: Value =
            serde_json::from_slice(bytes.get(8..8 + hl).ok_or("ヘッダーが途中で切れています")?)
                .map_err(|e| e.to_string())?;
        if header["version"].as_u64() != Some(1) {
            return Err("対応していない版です".into());
        }
        let num = |k: &str| {
            header[k]
                .as_u64()
                .map(|v| v as usize)
                .ok_or(format!("{k} がありません"))
        };
        let strs = |k: &str| -> Vec<String> {
            header[k]
                .as_array()
                .map(|a| {
                    a.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default()
        };
        let mut off = 8 + hl;
        let mut t: HashMap<String, Vec<f32>> = HashMap::new();
        for spec in header["tensors"].as_array().ok_or("tensors がありません")? {
            let name = spec["name"].as_str().ok_or("名前のない重み")?.to_string();
            let n: usize = spec["shape"]
                .as_array()
                .ok_or("shape がありません")?
                .iter()
                .map(|v| v.as_u64().unwrap_or(0) as usize)
                .product();
            let raw = bytes
                .get(off..off + 4 * n)
                .ok_or(format!("{name} が途中で切れています"))?;
            t.insert(
                name,
                raw.chunks_exact(4)
                    .map(|c| f32::from_le_bytes(c.try_into().unwrap()))
                    .collect(),
            );
            off += 4 * n;
        }
        let mut take = |k: &str| t.remove(k).ok_or(format!("重み {k} がありません"));
        let (nb, d, heads, ffn, pair) = (
            num("nb")?,
            num("d")?,
            num("heads")?,
            num("ffn")?,
            num("pair")?,
        );
        let mut layers = Vec::new();
        for i in 0..num("layers")? {
            let p = |s: &str| format!("layers.{i}.{s}");
            layers.push(Layer {
                qkv_w: take(&p("qkv.weight"))?,
                qkv_b: take(&p("qkv.bias"))?,
                out_w: take(&p("out.weight"))?,
                out_b: take(&p("out.bias"))?,
                ln1: (take(&p("ln1.weight"))?, take(&p("ln1.bias"))?),
                ff1_w: take(&p("ff1.weight"))?,
                ff1_b: take(&p("ff1.bias"))?,
                ff2_w: take(&p("ff2.weight"))?,
                ff2_b: take(&p("ff2.bias"))?,
                ln2: (take(&p("ln2.weight"))?, take(&p("ln2.bias"))?),
            });
        }
        let m = Model {
            nb,
            d,
            heads,
            ffn,
            pair,
            n_cat: strs("coarse").len(),
            keys: strs("keys"),
            types: strs("types"),
            text: take("text.weight")?,
            key: take("key.weight")?,
            typ: take("typ.weight")?,
            ln0: (take("ln0.weight")?, take("ln0.bias")?),
            layers,
            cat_w: take("cat.weight")?,
            cat_b: take("cat.bias")?,
            pair_w: take("pair.weight")?,
            pair_bias: take("pair_bias")?.first().copied().unwrap_or(0.0),
            axis_w: take("axis.weight")?,
            axis_bias: take("axis_bias")?.first().copied().unwrap_or(0.0),
        };
        if m.text.len() != nb * d
            || m.key.len() != m.keys.len() * d
            || m.n_cat != RANK.len()
            || d % heads != 0
        {
            return Err("重みの大きさが合いません".into());
        }
        Ok(m)
    }

    pub fn infer(&self, actions: &[Input]) -> Output {
        let (n, d) = (actions.len(), self.d);
        let mut x = vec![0.0f32; n * d];
        for (i, a) in actions.iter().enumerate() {
            let row = &mut x[i * d..(i + 1) * d];
            let h = featurize(&[Some(a.label), Some(a.id), a.bind], self.nb);
            for &f in &h {
                for (r, w) in row.iter_mut().zip(&self.text[f * d..(f + 1) * d]) {
                    *r += w;
                }
            }
            let cnt = h.len().max(1) as f32;
            let k = a
                .default
                .and_then(|k| self.keys.iter().position(|x| x == k))
                .unwrap_or(0);
            let t = self.types.iter().position(|x| x == a.kind).unwrap_or(0);
            for j in 0..d {
                row[j] = row[j] / cnt + self.key[k * d + j] + self.typ[t * d + j];
            }
        }
        layer_norm(&mut x, d, &self.ln0);
        for l in &self.layers {
            x = self.layer(l, &x, n);
        }
        let logits = linear(&x, n, &self.cat_w, Some(&self.cat_b), d, self.n_cat);
        let category = logits.chunks(self.n_cat).map(softmax).collect();
        let affinity = self.pairwise(&x, n, &self.pair_w, self.pair_bias);
        let axis = self.pairwise(&x, n, &self.axis_w, self.axis_bias);
        Output {
            category,
            affinity,
            axis,
        }
    }

    /// sigmoid(p_i・p_j / √k + bias)、p = x W^T
    fn pairwise(&self, x: &[f32], n: usize, w: &[f32], bias: f32) -> Vec<Vec<f32>> {
        let k = self.pair;
        let p = linear(x, n, w, None, self.d, k);
        let scale = 1.0 / (k as f32).sqrt();
        (0..n)
            .map(|i| {
                (0..n)
                    .map(|j| {
                        let dot: f32 = p[i * k..(i + 1) * k]
                            .iter()
                            .zip(&p[j * k..(j + 1) * k])
                            .map(|(a, b)| a * b)
                            .sum();
                        sigmoid(dot * scale + bias)
                    })
                    .collect()
            })
            .collect()
    }

    fn layer(&self, l: &Layer, x: &[f32], n: usize) -> Vec<f32> {
        let (d, h) = (self.d, self.heads);
        let dh = d / h;
        let qkv = linear(x, n, &l.qkv_w, Some(&l.qkv_b), d, 3 * d);
        let mut y = vec![0.0f32; n * d];
        let scale = 1.0 / (dh as f32).sqrt();
        for head in 0..h {
            let q = |i: usize| &qkv[i * 3 * d + head * dh..i * 3 * d + head * dh + dh];
            let k = |i: usize| &qkv[i * 3 * d + d + head * dh..i * 3 * d + d + head * dh + dh];
            let v =
                |i: usize| &qkv[i * 3 * d + 2 * d + head * dh..i * 3 * d + 2 * d + head * dh + dh];
            for i in 0..n {
                let scores: Vec<f32> = (0..n)
                    .map(|j| q(i).iter().zip(k(j)).map(|(a, b)| a * b).sum::<f32>() * scale)
                    .collect();
                let att = softmax(&scores);
                for (j, a) in att.iter().enumerate() {
                    for (o, vv) in y[i * d + head * dh..i * d + head * dh + dh]
                        .iter_mut()
                        .zip(v(j))
                    {
                        *o += a * vv;
                    }
                }
            }
        }
        let mut x1: Vec<f32> = linear(&y, n, &l.out_w, Some(&l.out_b), d, d)
            .iter()
            .zip(x)
            .map(|(a, b)| a + b)
            .collect();
        layer_norm(&mut x1, d, &l.ln1);
        let mut f = linear(&x1, n, &l.ff1_w, Some(&l.ff1_b), d, self.ffn);
        for v in f.iter_mut() {
            *v = gelu(*v);
        }
        let mut x2: Vec<f32> = linear(&f, n, &l.ff2_w, Some(&l.ff2_b), self.ffn, d)
            .iter()
            .zip(&x1)
            .map(|(a, b)| a + b)
            .collect();
        layer_norm(&mut x2, d, &l.ln2);
        x2
    }
}

fn linear(x: &[f32], n: usize, w: &[f32], b: Option<&[f32]>, inp: usize, out: usize) -> Vec<f32> {
    let mut y = vec![0.0f32; n * out];
    for i in 0..n {
        let xi = &x[i * inp..(i + 1) * inp];
        for o in 0..out {
            let s: f32 = xi
                .iter()
                .zip(&w[o * inp..(o + 1) * inp])
                .map(|(a, b)| a * b)
                .sum();
            y[i * out + o] = s + b.map_or(0.0, |b| b[o]);
        }
    }
    y
}

fn layer_norm(x: &mut [f32], d: usize, (w, b): &(Vec<f32>, Vec<f32>)) {
    for row in x.chunks_mut(d) {
        let mean = row.iter().sum::<f32>() / d as f32;
        let var = row.iter().map(|v| (v - mean) * (v - mean)).sum::<f32>() / d as f32;
        let inv = 1.0 / (var + 1e-5).sqrt();
        for (j, v) in row.iter_mut().enumerate() {
            *v = (*v - mean) * inv * w[j] + b[j];
        }
    }
}

fn softmax(v: &[f32]) -> Vec<f32> {
    let m = v.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
    let e: Vec<f32> = v.iter().map(|x| (x - m).exp()).collect();
    let s: f32 = e.iter().sum();
    e.iter().map(|x| x / s).collect()
}

fn sigmoid(x: f32) -> f32 {
    1.0 / (1.0 + (-x).exp())
}

fn gelu(x: f32) -> f32 {
    0.5 * x * (1.0 + ((2.0 / std::f32::consts::PI).sqrt() * (x + 0.044715 * x * x * x)).tanh())
}

// ---------------------------------------------------------------- 特徴量 (train.py と同一)

/// 文字列を (英数字か, 語) に分ける。camelCase・英字と数字の境目・記号・「・」などで区切る
fn words(s: &str) -> Vec<(bool, String)> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut kind: Option<bool> = None;
    let mut prev: Option<char> = None;
    let flush = |cur: &mut String, kind: &mut Option<bool>, out: &mut Vec<(bool, String)>| {
        if !cur.is_empty() {
            out.push((kind.unwrap_or(true), std::mem::take(cur)));
        }
        *kind = None;
    };
    for ch in s.chars() {
        if ch.is_ascii() {
            if ch.is_ascii_alphanumeric() {
                if kind == Some(true) && !cur.is_empty() {
                    let p = prev.unwrap_or(' ');
                    if (p.is_ascii_lowercase() && ch.is_ascii_uppercase())
                        || (p.is_ascii_alphabetic() != ch.is_ascii_alphabetic())
                    {
                        flush(&mut cur, &mut kind, &mut out);
                    }
                }
                if kind != Some(true) {
                    flush(&mut cur, &mut kind, &mut out);
                    kind = Some(true);
                }
                cur.push(ch.to_ascii_lowercase());
            } else {
                flush(&mut cur, &mut kind, &mut out);
            }
        } else if JA_SEP.contains(ch) || ch.is_whitespace() {
            flush(&mut cur, &mut kind, &mut out);
        } else {
            if kind != Some(false) {
                flush(&mut cur, &mut kind, &mut out);
                kind = Some(false);
            }
            cur.push(ch);
        }
        prev = Some(ch);
    }
    flush(&mut cur, &mut kind, &mut out);
    out
}

fn fnv1a(s: &str) -> u32 {
    let mut h: u32 = 0x811C_9DC5;
    for b in s.bytes() {
        h ^= b as u32;
        h = h.wrapping_mul(0x0100_0193);
    }
    h
}

/// ラベル・ID・設定名 → 特徴のハッシュの添字 (重複なし・小さい順・上限 FMAX)
pub fn featurize(texts: &[Option<&str>], nb: usize) -> Vec<usize> {
    let mut fs = std::collections::BTreeSet::new();
    for t in texts.iter().flatten() {
        for (ascii, w) in words(t) {
            if ascii {
                fs.insert(format!("w:{w}"));
                let b: Vec<char> = format!("<{w}>").chars().collect();
                for g in b.windows(3) {
                    fs.insert(format!("t:{}", g.iter().collect::<String>()));
                }
            } else {
                let cs: Vec<char> = w.chars().collect();
                if cs.len() <= 8 {
                    fs.insert(format!("w:{w}"));
                }
                for c in &cs {
                    fs.insert(format!("c:{c}"));
                }
                for g in cs.windows(2) {
                    fs.insert(format!("b:{}", g.iter().collect::<String>()));
                }
            }
        }
    }
    let set: std::collections::BTreeSet<usize> =
        fs.iter().map(|f| fnv1a(f) as usize % nb).collect();
    set.into_iter().take(FMAX).collect()
}

// ---------------------------------------------------------------- プリセットの組み立て

/// 参加人数 n (1〜4) のプリセット。操作定義の担当の付く操作 (role が P1〜P3) だけを配る。
/// 1. モデルが「同じ人が持つべき」とした操作をまとめる (平均連結、確率 0.5 超)
/// 2. まとまりが人数より多ければ、意味の近さ・カテゴリの相性から負担の罰則を引いた値が最も高い 2 つを統合する
/// 3. 人数より少なければ、最も重いまとまりを中で最も遠い 2 つの操作を境に分ける
/// 4. 優先度 (移動 > 視点 > 行動 > 持ち物) の高い順に P1 から並べ、負担が平均の 1.5 倍を超える人がいれば組み替える
///
/// 人による評価 (2026-11-13、19 本・43 件) を受けて、次を足した (#411):
/// - 持ち物の切り替え・メニュー・会話だけのまとまり (ホットバー 1〜10 など) は、ボタンの数ではなく 1 人分の小さな負担 (1) と数える
/// - 担当が持ち物・メニュー・会話だけになる人を作らない (「ツールバーだけ」「通報だけ」ではすることがない)。行動の担当に寄せ、代わりに行動・移動を分ける
/// - 方向の移動 (WASD・矢印・2 軸) を持つまとまりを P1 (ホスト) にする
pub fn presets(m: &Model, p: &Profile, n: usize) -> Vec<Vec<String>> {
    let n = n.clamp(1, 4);
    let inputs: Vec<Input> = p
        .actions
        .iter()
        .map(|a| Input {
            id: &a.id,
            label: &a.label,
            bind: a.bind.as_deref(),
            kind: &a.kind,
            default: a.default,
        })
        .collect();
    let out = m.infer(&inputs);
    let playable: Vec<usize> = (0..p.actions.len())
        .filter(|&i| {
            p.groups
                .iter()
                .any(|g| g.id == p.actions[i].group && g.role.starts_with('P'))
        })
        .collect();
    let mut slots = vec![Vec::new(); n];
    if playable.is_empty() {
        return slots;
    }
    let aff = |a: &[usize], b: &[usize]| -> f32 {
        let s: f32 = a
            .iter()
            .flat_map(|&i| b.iter().map(move |&j| (i, j)))
            .map(|(i, j)| out.affinity[i][j])
            .sum();
        s / (a.len() * b.len()) as f32
    };
    // 持ち物の切り替え・メニュー・会話 (遊んでいる間ずっと手を動かす操作ではない)。カテゴリの順は train.py の COARSE
    let low = |i: usize| {
        let c = &out.category[i];
        let top = (0..c.len())
            .max_by(|&a, &b| c[a].total_cmp(&c[b]))
            .unwrap_or(0);
        top >= LOW_ACTIVITY
    };
    let idle = |c: &[usize]| c.iter().all(|&i| low(i));

    // 1. 自然なまとまり。操作定義の同じグループにあるカーソル (マウスの移動) とクリックは、最初から同じ人に持たせる
    //    (Among Us のタスクはカーソルを動かしてクリックする。モデルは視点と行動として別の人に分けがちなので、#411)
    let mut clusters: Vec<Vec<usize>> = Vec::new();
    // (カーソル, クリック) の組。分けるときも同じ側に置く
    let links: Vec<(usize, usize)> = playable
        .iter()
        .flat_map(|&i| playable.iter().map(move |&j| (i, j)))
        .filter(|&(i, j)| {
            p.actions[i].kind == "mouseDelta"
                && is_click(&p.actions[j])
                && p.actions[i].group == p.actions[j].group
        })
        .collect();
    for &i in &playable {
        let a = &p.actions[i];
        let pointer_pair = |c: &Vec<usize>| {
            c.iter().any(|&j| {
                let b = &p.actions[j];
                b.group == a.group
                    && ((a.kind == "mouseDelta" && is_click(b))
                        || (b.kind == "mouseDelta" && is_click(a)))
            })
        };
        match clusters.iter_mut().find(|c| pointer_pair(c)) {
            Some(c) => c.push(i),
            None => clusters.push(vec![i]),
        }
    }
    loop {
        let mut best: Option<(f32, usize, usize)> = None;
        for a in 0..clusters.len() {
            for b in a + 1..clusters.len() {
                let s = aff(&clusters[a], &clusters[b]);
                if s > 0.5 && best.is_none_or(|(bs, _, _)| s > bs) {
                    best = Some((s, a, b));
                }
            }
        }
        let Some((_, a, b)) = best else { break };
        let moved = clusters.remove(b);
        clusters[a].extend(moved);
        clusters[a].sort();
    }
    let natural = clusters.clone();
    // 持ち物などだけのまとまりは、合わせて負担 1 と数える (ホットバー 10 個を 10 人分の重さにしない)
    let mut scale = vec![1.0f32; p.actions.len()];
    for c in natural.iter().filter(|c| idle(c)) {
        let s: f32 = c
            .iter()
            .map(|&i| p.actions[i].weight.max(0.01) as f32)
            .sum();
        if s > 1.0 {
            for &i in c {
                scale[i] = 1.0 / s;
            }
        }
    }
    let w = |i: usize| p.actions[i].weight.max(0.01) as f32 * scale[i];
    let load = |c: &[usize]| c.iter().map(|&i| w(i)).sum::<f32>();
    let cat = |c: &[usize]| -> Vec<f32> {
        let mut v = vec![0.0f32; RANK.len()];
        for &i in c {
            for (k, x) in out.category[i].iter().enumerate() {
                v[k] += x * w(i);
            }
        }
        let s = load(c);
        v.iter().map(|x| x / s).collect()
    };
    let compat = |a: &[usize], b: &[usize]| -> f32 {
        let (ca, cb) = (cat(a), cat(b));
        (0..RANK.len())
            .flat_map(|i| (0..RANK.len()).map(move |j| (i, j)))
            .map(|(i, j)| ca[i] * COMPAT[i][j] * cb[j])
            .sum()
    };
    // 方向の移動 (WASD・矢印のキー、2 軸の入力) の割合。P1 (ホスト) に方向の移動を持たせるのに使う
    let dir = |c: &[usize]| -> f32 {
        let d = c.iter().filter(|&&i| {
            let a = &p.actions[i];
            a.kind == "axis2d" || a.default.is_some_and(|k| DIRECTION_KEYS.contains(&k))
        });
        d.count() as f32 / c.len() as f32
    };
    let priority = |c: &[usize]| -> (f32, usize) {
        (
            cat(c).iter().zip(RANK).map(|(x, r)| x * r).sum::<f32>() - DIRECTION_BONUS * dir(c),
            *c.iter().min().unwrap(),
        )
    };
    let total = load(&playable);
    let avg = total / n as f32;

    // 2 つのまとまりを統合して数を減らす (意味の近さ・カテゴリの相性から負担の罰則を引いた値が最も高い組)
    let merge_to = |clusters: &mut Vec<Vec<usize>>, n: usize| {
        while clusters.len() > n {
            let mut best = (f32::NEG_INFINITY, 0, 1);
            for a in 0..clusters.len() {
                for b in a + 1..clusters.len() {
                    let (ca, cb) = (&clusters[a], &clusters[b]);
                    let s = 0.5 * aff(ca, cb) + 0.5 * compat(ca, cb)
                        - LAMBDA * (load(ca) + load(cb)) / avg;
                    if s > best.0 {
                        best = (s, a, b);
                    }
                }
            }
            let moved = clusters.remove(best.2);
            clusters[best.1].extend(moved);
            clusters[best.1].sort();
        }
    };
    // カーソルとクリックが別の側に分かれたら、クリックをカーソルの側へ戻す (戻すと片方が空になるときは戻さない)
    let keep_linked = |a: &mut Vec<usize>, b: &mut Vec<usize>| {
        for &(cur, click) in &links {
            let (from, to) = if a.contains(&cur) && b.contains(&click) {
                (&mut *b, &mut *a)
            } else if b.contains(&cur) && a.contains(&click) {
                (&mut *a, &mut *b)
            } else {
                continue;
            };
            if from.len() > 1 {
                from.retain(|&x| x != click);
                to.push(click);
            }
        }
    };
    // 1 つのまとまりを、中で最も遠い 2 つの操作を境に 2 つへ分ける。
    // 「同じ人が持つべきでない」組 (確率 0.5 未満) があればその近さで、全員が同じ人向き (方向キーだけ等) なら軸で分ける
    let split = |c: &[usize]| -> (Vec<usize>, Vec<usize>) {
        let mixed = c
            .iter()
            .any(|&i| c.iter().any(|&j| out.affinity[i][j] < 0.5));
        let near = |i: usize, j: usize| {
            if mixed {
                out.affinity[i][j]
            } else {
                out.axis[i][j]
            }
        };
        let near_to =
            |i: usize, g: &[usize]| g.iter().map(|&j| near(i, j)).sum::<f32>() / g.len() as f32;
        let (mut s0, mut s1, mut lo) = (c[0], c[1], f32::INFINITY);
        for (x, &i) in c.iter().enumerate() {
            for &j in &c[x + 1..] {
                if near(i, j) < lo {
                    (s0, s1, lo) = (i, j, near(i, j));
                }
            }
        }
        let (mut a, mut b) = (vec![s0], vec![s1]);
        for &i in c.iter().filter(|&&i| i != s0 && i != s1) {
            // 近いほうへ。同じくらいなら軽いほうへ
            let (da, db) = (near_to(i, &a), near_to(i, &b));
            if da > db + 0.05 || ((da - db).abs() <= 0.05 && load(&a) <= load(&b)) {
                a.push(i)
            } else {
                b.push(i)
            }
        }
        keep_linked(&mut a, &mut b);
        a.sort();
        b.sort();
        (a, b)
    };
    let max_load = |cs: &[Vec<usize>]| cs.iter().map(|c| load(c)).fold(0.0f32, f32::max);

    // 2. 人数まで統合する
    merge_to(&mut clusters, n);
    // 3. 人数まで分ける (最も重いまとまりから)
    while clusters.len() < n {
        let Some(ci) = (0..clusters.len())
            .filter(|&c| clusters[c].len() >= 2)
            .max_by(|&a, &b| load(&clusters[a]).total_cmp(&load(&clusters[b])))
        else {
            break;
        };
        let c = clusters.remove(ci);
        let (a, b) = split(&c);
        clusters.insert(ci, b);
        clusters.insert(ci, a);
    }
    // 4. 偏りを直す (最も重い人が平均の 1.5 倍を超える間、最大の負担が下がる組み替えだけを採る)
    //    a. 重い人の自然なまとまりを 1 つ、最も軽い人へ移す
    //    b. 重い人の操作を 2 つに分け、ほかで最も相性のよい 2 人を統合する
    for _ in 0..8 {
        if clusters.len() < 2 {
            break;
        }
        let loads: Vec<f32> = clusters.iter().map(|c| load(c)).collect();
        let heavy = (0..clusters.len())
            .max_by(|&a, &b| loads[a].total_cmp(&loads[b]))
            .unwrap();
        let light = (0..clusters.len())
            .min_by(|&a, &b| loads[a].total_cmp(&loads[b]))
            .unwrap();
        if loads[heavy] <= avg * 1.5 || clusters[heavy].len() < 2 {
            break;
        }
        // (組み替えた案, 同じ負担のときの順位: 小さいほどよい)
        let mut candidates: Vec<(Vec<Vec<usize>>, f32)> = Vec::new();
        let parts: Vec<&Vec<usize>> = natural
            .iter()
            .filter(|nc| nc.iter().all(|i| clusters[heavy].contains(i)))
            .collect();
        if parts.len() >= 2 {
            for part in parts {
                let mut c = clusters.clone();
                c[heavy].retain(|i| !part.contains(i));
                c[light].extend(part.iter().copied());
                c[light].sort();
                candidates.push((c, -1.0));
            }
        }
        let mut base = clusters.clone();
        let (a, b) = split(&base.remove(heavy));
        base.push(a);
        base.push(b);
        let (ha, hb) = (base.len() - 2, base.len() - 1);
        for x in 0..base.len() {
            for y in x + 1..base.len() {
                if (x, y) == (ha, hb) {
                    continue; // 分けた 2 つを戻さない
                }
                let s = 0.5 * aff(&base[x], &base[y]) + 0.5 * compat(&base[x], &base[y]);
                let mut c = base.clone();
                let moved = c.remove(y);
                c[x].extend(moved);
                c[x].sort();
                candidates.push((c, -s));
            }
        }
        let Some((best, _)) = candidates.into_iter().min_by(|(a, sa), (b, sb)| {
            let (la, lb) = (max_load(a), max_load(b));
            if (la - lb).abs() > 1e-6 {
                la.total_cmp(&lb)
            } else {
                sa.total_cmp(sb)
            }
        }) else {
            break;
        };
        if max_load(&best) >= loads[heavy] - 1e-6 {
            break;
        }
        clusters = best;
    }
    // 5. 持ち物・メニュー・会話だけの担当を作らない (#411、人による評価)。その担当は相性のよい人へ寄せ、
    //    代わりに、遊びの操作を持つ中で最も重い人を分ける。遊びの操作が人数に足りなければ、そのままにする
    let split_active = |c: &[usize]| -> Option<(Vec<usize>, Vec<usize>)> {
        let act: Vec<usize> = c.iter().copied().filter(|&i| !low(i)).collect();
        if act.len() < 2 {
            return None;
        }
        let (mut a, mut b) = split(&act);
        for &i in c.iter().filter(|&&i| low(i)) {
            if aff(&[i], &a) >= aff(&[i], &b) {
                a.push(i)
            } else {
                b.push(i)
            }
        }
        keep_linked(&mut a, &mut b);
        a.sort();
        b.sort();
        Some((a, b))
    };
    for _ in 0..4 {
        let Some(ix) = (0..clusters.len()).find(|&k| idle(&clusters[k])) else {
            break;
        };
        let Some(target) = (0..clusters.len())
            .filter(|&k| k != ix && !idle(&clusters[k]))
            .max_by(|&a, &b| {
                let s = |k: usize| {
                    0.5 * aff(&clusters[ix], &clusters[k])
                        + 0.5 * compat(&clusters[ix], &clusters[k])
                };
                s(a).total_cmp(&s(b))
            })
        else {
            break;
        };
        let mut c = clusters.clone();
        let moved = c.remove(ix);
        let target = if target > ix { target - 1 } else { target };
        c[target].extend(moved);
        c[target].sort();
        // 重い順に、することがない担当を作らず、カーソルとクリックも離さない分け方を探す
        let mut order: Vec<usize> = (0..c.len())
            .filter(|&k| c[k].iter().filter(|&&i| !low(i)).count() >= 2)
            .collect();
        order.sort_by(|&a, &b| load(&c[b]).total_cmp(&load(&c[a])));
        let broken = |a: &[usize], b: &[usize]| {
            links.iter().any(|&(x, y)| {
                (a.contains(&x) && b.contains(&y)) || (b.contains(&x) && a.contains(&y))
            })
        };
        let Some((heavy, a, b)) = order.into_iter().find_map(|k| {
            split_active(&c[k])
                .filter(|(a, b)| !idle(a) && !idle(b) && !broken(a, b))
                .map(|(a, b)| (k, a, b))
        }) else {
            break;
        };
        c.remove(heavy);
        c.push(a);
        c.push(b);
        clusters = c;
    }
    clusters.sort_by(|a, b| {
        let (pa, pb) = (priority(a), priority(b));
        pa.0.total_cmp(&pb.0).then(pa.1.cmp(&pb.1))
    });
    for (k, c) in clusters.into_iter().enumerate().take(n) {
        slots[k] = c.into_iter().map(|i| p.actions[i].id.clone()).collect();
    }
    slots
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::profiles;
    use std::path::Path;

    fn load(id: &str) -> Profile {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../game-profiles")
            .join(format!("{id}.json"));
        profiles::parse(&serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap())
            .unwrap()
    }

    /// 人による評価 (#411) に使った 19 本
    const REVIEW_IDS: [&str; 19] = [
        "minecraft-java",
        "steam-945360",
        "steam-105600",
        "steam-1966720",
        "steam-413150",
        "steam-3241660",
        "steam-1568590",
        "steam-1621690",
        "steam-892970",
        "steam-620",
        "steam-550",
        "steam-440",
        "steam-730",
        "steam-4000",
        "steam-268910",
        "steam-2483190",
        "steam-1172470",
        "steam-2767030",
        "steam-250900",
    ];

    fn same(a: &[Vec<String>], ids: &[&str]) -> bool {
        a.iter()
            .any(|s| ids.iter().all(|x| s.iter().any(|y| y == x)))
    }

    #[test]
    fn features_match_python() {
        // train.py の words / features と同じ分け方
        assert_eq!(
            words("MoveForward"),
            vec![(true, "move".into()), (true, "forward".into())]
        );
        assert_eq!(
            words("key.hotbar10"),
            vec![
                (true, "key".into()),
                (true, "hotbar".into()),
                (true, "10".into())
            ]
        );
        assert_eq!(
            words("使う・調べる"),
            vec![(false, "使う".into()), (false, "調べる".into())]
        );
        assert_eq!(
            words("IA_Jump武器1"),
            vec![
                (true, "ia".into()),
                (true, "jump".into()),
                (false, "武器".into()),
                (true, "1".into())
            ]
        );
    }

    /// Python (train.py) の推論と同じ値になる (特徴量・重みの読み方・計算の順の取り違えを防ぐ)
    #[test]
    fn inference_matches_python() {
        let m = model().expect("埋め込んだ重みが読める");
        let fx: Value =
            serde_json::from_str(include_str!("../assets/preset-model-parity.json")).unwrap();
        for case in fx["cases"].as_array().unwrap() {
            let acts = case["actions"].as_array().unwrap();
            let inputs: Vec<Input> = acts
                .iter()
                .map(|a| Input {
                    id: a["id"].as_str().unwrap(),
                    label: a["label"].as_str().unwrap_or(""),
                    bind: a["bind"].as_str(),
                    kind: a["type"].as_str().unwrap(),
                    default: a["default"].as_str(),
                })
                .collect();
            for (i, a) in inputs.iter().enumerate() {
                let want: Vec<usize> = case["features"][i]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|v| v.as_u64().unwrap() as usize)
                    .collect();
                assert_eq!(
                    featurize(&[Some(a.label), Some(a.id), a.bind], m.nb),
                    want,
                    "{} の特徴",
                    a.id
                );
            }
            let out = m.infer(&inputs);
            for i in 0..inputs.len() {
                for k in 0..m.n_cat {
                    let want = case["category"][i][k].as_f64().unwrap() as f32;
                    assert!(
                        (out.category[i][k] - want).abs() < 2e-4,
                        "{} {i} カテゴリ {k}: {} != {want}",
                        case["name"],
                        out.category[i][k]
                    );
                }
                for j in 0..inputs.len() {
                    let want = case["affinity"][i][j].as_f64().unwrap() as f32;
                    assert!(
                        (out.affinity[i][j] - want).abs() < 2e-4,
                        "{} {i},{j} 同じ人: {} != {want}",
                        case["name"],
                        out.affinity[i][j]
                    );
                    let want = case["axis"][i][j].as_f64().unwrap() as f32;
                    assert!(
                        (out.axis[i][j] - want).abs() < 2e-4,
                        "{} {i},{j} 軸: {} != {want}",
                        case["name"],
                        out.axis[i][j]
                    );
                }
            }
        }
    }

    /// 分担できる全定義・2〜4 人で: 重複・漏れなし、全員に担当、P1 に移動系、負担の偏りが規則の範囲内
    #[test]
    fn presets_cover_all_profiles_without_gaps() {
        let m = model().unwrap();
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../game-profiles");
        let (list, errors) = profiles::load_dir(&dir);
        assert!(errors.is_empty(), "{errors:?}");
        let mut checked = 0;
        for p in list.iter().filter(|p| profiles::controller_supported(p)) {
            let mut playable: Vec<String> = p
                .actions
                .iter()
                .filter(|a| {
                    p.groups
                        .iter()
                        .any(|g| g.id == a.group && g.role.starts_with('P'))
                })
                .map(|a| a.id.clone())
                .collect();
            playable.sort();
            // 持ち物・メニュー・会話の操作は、1 人分で合わせて最大 1 と数える (組み立てと同じ考え方、#411)
            let inputs: Vec<Input> = p
                .actions
                .iter()
                .map(|a| Input {
                    id: &a.id,
                    label: &a.label,
                    bind: a.bind.as_deref(),
                    kind: &a.kind,
                    default: a.default,
                })
                .collect();
            let out = m.infer(&inputs);
            let low = |i: usize| {
                let c = &out.category[i];
                (0..c.len()).max_by(|&a, &b| c[a].total_cmp(&c[b])).unwrap() >= LOW_ACTIVITY
            };
            let weight = |ids: &[String]| {
                let (mut busy, mut light) = (0.0, 0.0);
                for i in ids
                    .iter()
                    .filter_map(|i| p.actions.iter().position(|a| &a.id == i))
                {
                    if low(i) {
                        light += p.actions[i].weight
                    } else {
                        busy += p.actions[i].weight
                    }
                }
                busy + f64::min(light, 1.0)
            };
            for n in 2..=4 {
                let a = presets(m, p, n);
                let name = format!("{} {n}人", p.id);
                assert_eq!(a.len(), n, "{name}");
                let mut flat = a.concat();
                flat.sort();
                assert_eq!(flat, playable, "{name}: 重複・漏れ");
                if playable.len() >= n {
                    assert!(
                        a.iter().all(|s| !s.is_empty()),
                        "{name}: 担当のない人 {a:?}"
                    );
                }
                let loads: Vec<f64> = a.iter().map(|s| weight(s)).collect();
                let avg = loads.iter().sum::<f64>() / n as f64;
                let max = loads.iter().cloned().fold(0.0, f64::max);
                // 視点 (重さ 3) のように分けられない 1 つの操作だけを持つ人は例外。
                // カーソルと同じグループのクリックは分けない 1 組、持ち物・メニュー・会話は数えない
                let heavy = &a[loads.iter().position(|l| *l == max).unwrap()];
                let units = heavy
                    .iter()
                    .filter_map(|x| p.actions.iter().position(|a| &a.id == x))
                    .filter(|&i| !low(i))
                    .filter(|&i| {
                        let a = &p.actions[i];
                        !(is_click(a)
                            && heavy.iter().any(|y| {
                                p.actions.iter().any(|b| {
                                    &b.id == y && b.kind == "mouseDelta" && b.group == a.group
                                })
                            }))
                    })
                    .count();
                assert!(
                    units <= 1 || max <= avg * 1.5 + 1e-9,
                    "{name}: 負担の偏り {loads:?} {a:?}"
                );
            }
            checked += 1;
        }
        assert!(checked > 300, "対象 {checked} 本");
    }

    #[test]
    fn presets_keep_natural_groups_together() {
        let m = model().unwrap();
        // FPS: 前後左右は 1 人の親指、武器の番号は 1 人、移動は P1
        // Minecraft 4 人: 移動は方向と姿勢 (ジャンプ・スニーク・ダッシュ) に分かれる
        let mc = load("minecraft-java");
        let a = presets(m, &mc, 4);
        assert!(
            same(&a, &["forward", "back", "left", "right"])
                && same(&a, &["jump", "sneak", "sprint"]),
            "Minecraft 4人 {a:?}"
        );
        let fps = load("steam-1172470");
        for n in 2..=4 {
            let a = presets(m, &fps, n);
            assert!(
                same(&a, &["forward", "back", "left", "right"]),
                "FPS {n}人 {a:?}"
            );
            assert!(
                a[0].iter().any(|x| x == "forward"),
                "FPS {n}人: P1 が移動 {a:?}"
            );
        }
        // 2 人なら「移動」と「狙って撃つ」に分かれる
        let a = presets(m, &fps, 2);
        assert!(same(&a, &["look", "fire"]), "FPS 2人 {a:?}");
        // 方向を分けるときは縦と横の軸で分ける (Cuphead 4 人: 左右と上下)
        let cup = load("steam-268910");
        let a = presets(m, &cup, 4);
        assert!(
            same(&a, &["left", "right"]) && same(&a, &["up", "down"]),
            "Cuphead 4人 {a:?}"
        );
        // Terraria (手作り): ホットバーは 1 人
        let t = load("steam-105600");
        for n in 2..=4 {
            let a = presets(m, &t, n);
            assert!(
                same(&a, &["hotbar1", "hotbar2", "hotbar3", "hotbar4", "hotbar5"]),
                "Terraria {n}人 {a:?}"
            );
        }
    }

    /// 表は `cargo test --release preset_table -- --ignored --nocapture` で出力する
    /// 人による評価 (2026-11-13) で指摘された「することがない担当」と「P1 に移動がない」を作らない (#411)
    #[test]
    fn presets_give_everyone_something_to_play_and_p1_the_movement() {
        let m = model().unwrap();
        for id in REVIEW_IDS {
            let p = load(id);
            let inputs: Vec<Input> = p
                .actions
                .iter()
                .map(|a| Input {
                    id: &a.id,
                    label: &a.label,
                    bind: a.bind.as_deref(),
                    kind: &a.kind,
                    default: a.default,
                })
                .collect();
            let out = m.infer(&inputs);
            let index = |aid: &str| p.actions.iter().position(|a| a.id == aid).unwrap();
            let low = |aid: &str| {
                let c = &out.category[index(aid)];
                (0..c.len()).max_by(|&a, &b| c[a].total_cmp(&c[b])).unwrap() >= LOW_ACTIVITY
            };
            let dir = |aid: &str| {
                let a = &p.actions[index(aid)];
                a.kind == "axis2d" || a.default.is_some_and(|k| DIRECTION_KEYS.contains(&k))
            };
            let playable: Vec<&str> = p
                .actions
                .iter()
                .filter(|a| {
                    p.groups
                        .iter()
                        .any(|g| g.id == a.group && g.role.starts_with('P'))
                })
                .map(|a| a.id.as_str())
                .collect();
            let active = playable.iter().filter(|x| !low(x)).count();
            for n in 2..=4 {
                let a = presets(m, &p, n);
                if active >= n {
                    assert!(
                        a.iter().all(|s| s.iter().any(|x| !low(x))),
                        "{id} {n}人: 持ち物・メニューだけの人 {a:?}"
                    );
                }
                if playable.iter().any(|x| dir(x)) {
                    assert!(
                        a[0].iter().any(|x| dir(x)),
                        "{id} {n}人: P1 に方向の移動がない {a:?}"
                    );
                }
                if id == "steam-945360" {
                    assert!(
                        same(&a, &["cursor", "click"]),
                        "{id} {n}人: カーソルとクリックが別の人 {a:?}"
                    );
                }
            }
        }
    }

    /// 人による評価 (#411) 用に、規則とモデルの 2〜4 人の案を JSON で出す。
    /// `cargo test --release preset_review_json -- --ignored --nocapture` の REVIEW 行を集める。
    /// 対象は RECOOPLAY_REVIEW_IDS (カンマ区切り) で変えられる
    #[test]
    #[ignore]
    fn preset_review_json() {
        let m = model().unwrap();
        let ids = std::env::var("RECOOPLAY_REVIEW_IDS").unwrap_or_else(|_| REVIEW_IDS.join(","));
        for id in ids.split(',').map(str::trim).filter(|x| !x.is_empty()) {
            let p = load(id);
            let names = |a: Vec<Vec<String>>| -> Vec<Vec<String>> {
                a.into_iter()
                    .map(|s| {
                        s.iter()
                            .filter_map(|x| p.actions.iter().find(|a| &a.id == x))
                            .map(|a| a.label.clone())
                            .collect()
                    })
                    .collect()
            };
            let players: serde_json::Map<String, Value> = (2..=4)
                .map(|n| {
                    (n.to_string(), serde_json::json!({ "rule": names(profiles::rule_assignment_for(&p, n)), "model": names(presets(m, &p, n)) }))
                })
                .collect();
            println!(
                "REVIEW {}",
                serde_json::json!({ "id": id, "name": p.name, "status": p.status, "players": players })
            );
        }
    }

    #[test]
    #[ignore]
    fn preset_table() {
        let m = model().unwrap();
        for id in [
            "minecraft-java",
            "steam-1172470",
            "steam-2767030",
            "steam-268910",
            "steam-250900",
            "steam-2483190",
            "steam-105600",
        ] {
            let p = load(id);
            println!("\n### {}（{id}）\n| 人数 | プリセット |\n|---|---|", p.name);
            for n in 2..=4 {
                let cells: Vec<String> = presets(m, &p, n)
                    .iter()
                    .enumerate()
                    .map(|(i, s)| {
                        let l: Vec<&str> = s
                            .iter()
                            .filter_map(|x| p.actions.iter().find(|a| &a.id == x))
                            .map(|a| a.label.as_str())
                            .collect();
                        format!("P{}：{}", i + 1, l.join("・"))
                    })
                    .collect();
                println!("| {n} | {} |", cells.join("<br>"));
            }
        }
    }
}
