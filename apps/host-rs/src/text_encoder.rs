// 操作名の読み取り (#430)。多言語 MiniLM の小型版 (text-encoder.bin、形式 RCTE) で、操作名を 1 本のベクトルにする。
// 語彙を絞った埋め込みと、行ごとの8ビットの重み (倍率つき) を読み、BERT と同じ計算をする。外部へは通信しない。
// トークナイザーは元のモデルの tokenizer.json をそのまま使う。語彙の外のトークンは <unk> にする (学習時と同じ)。
use std::collections::HashMap;
use std::path::Path;

use serde_json::Value;

/// 行ごとの8ビットの重み。w[o][i] = q[o][i] * scale[o]
struct Int8 {
    q: Vec<i8>,
    scale: Vec<f32>,
    out: usize,
    inp: usize,
}

struct Layer {
    q: (Int8, Vec<f32>),
    k: (Int8, Vec<f32>),
    v: (Int8, Vec<f32>),
    o: (Int8, Vec<f32>),
    ln1: (Vec<f32>, Vec<f32>),
    ff1: (Int8, Vec<f32>),
    ff2: (Int8, Vec<f32>),
    ln2: (Vec<f32>, Vec<f32>),
}

pub struct TextEncoder {
    tokenizer: tokenizers::Tokenizer,
    rows: HashMap<u32, usize>,
    unk_row: usize,
    word: Int8,
    position: Vec<f32>,
    token_type: Vec<f32>,
    ln0: (Vec<f32>, Vec<f32>),
    layers: Vec<Layer>,
    hidden: usize,
    heads: usize,
    eps: f32,
    max_length: usize,
    position_start: usize,
    max_positions: usize,
}

enum Raw {
    F32(Vec<f32>),
    I8(Int8),
}

impl TextEncoder {
    /// dir に text-encoder.bin と tokenizer.json があること
    pub fn load(dir: &Path) -> Result<TextEncoder, String> {
        let bytes = std::fs::read(dir.join("text-encoder.bin"))
            .map_err(|e| format!("text-encoder.bin を読めません: {e}"))?;
        let tokenizer = tokenizers::Tokenizer::from_file(dir.join("tokenizer.json"))
            .map_err(|e| format!("tokenizer.json を読めません: {e}"))?;
        Self::from_parts(&bytes, tokenizer)
    }

    fn from_parts(bytes: &[u8], tokenizer: tokenizers::Tokenizer) -> Result<TextEncoder, String> {
        if bytes.len() < 8 || &bytes[..4] != b"RCTE" {
            return Err("形式が違います".into());
        }
        let hl = u32::from_le_bytes(bytes[4..8].try_into().unwrap()) as usize;
        let h: Value =
            serde_json::from_slice(bytes.get(8..8 + hl).ok_or("ヘッダーが途中で切れています")?)
                .map_err(|e| e.to_string())?;
        if h["version"].as_u64() != Some(1) {
            return Err("対応していない版です".into());
        }
        let num = |k: &str| {
            h[k].as_u64()
                .map(|v| v as usize)
                .ok_or(format!("{k} がありません"))
        };
        let mut off = 8 + hl;
        let mut t: HashMap<String, Raw> = HashMap::new();
        for spec in h["tensors"].as_array().ok_or("tensors がありません")? {
            let name = spec["name"].as_str().ok_or("名前のない重み")?.to_string();
            let shape: Vec<usize> = spec["shape"]
                .as_array()
                .ok_or("shape がありません")?
                .iter()
                .map(|v| v.as_u64().unwrap_or(0) as usize)
                .collect();
            let n: usize = shape.iter().product();
            let f32s = |raw: &[u8]| -> Vec<f32> {
                raw.as_chunks::<4>()
                    .0
                    .iter()
                    .map(|c| f32::from_le_bytes(*c))
                    .collect()
            };
            if spec["dtype"].as_str() == Some("i8") {
                let (out, inp) = (shape[0], shape.get(1).copied().unwrap_or(1));
                let q = bytes
                    .get(off..off + n)
                    .ok_or(format!("{name} が途中で切れています"))?
                    .iter()
                    .map(|&b| b as i8)
                    .collect();
                off += n;
                let scale = f32s(
                    bytes
                        .get(off..off + 4 * out)
                        .ok_or(format!("{name} の倍率が途中で切れています"))?,
                );
                off += 4 * out;
                t.insert(name, Raw::I8(Int8 { q, scale, out, inp }));
            } else {
                t.insert(
                    name.clone(),
                    Raw::F32(f32s(
                        bytes
                            .get(off..off + 4 * n)
                            .ok_or(format!("{name} が途中で切れています"))?,
                    )),
                );
                off += 4 * n;
            }
        }
        if off != bytes.len() {
            return Err("重みの大きさが合いません".into());
        }
        let mut i8s = HashMap::new();
        let mut plain = HashMap::new();
        for (k, v) in t.drain() {
            match v {
                Raw::I8(w) => {
                    i8s.insert(k, w);
                }
                Raw::F32(w) => {
                    plain.insert(k, w);
                }
            }
        }
        let mut take_i8 = |k: &str| i8s.remove(k).ok_or(format!("重み {k} がありません"));
        let mut take_f = |k: &str| plain.remove(k).ok_or(format!("重み {k} がありません"));
        let (hidden, heads) = (num("hidden")?, num("heads")?);
        let mut layers = Vec::new();
        for l in 0..num("layers")? {
            let p = |s: &str| format!("encoder.layer.{l}.{s}");
            let mut lin = |s: &str| -> Result<(Int8, Vec<f32>), String> {
                Ok((
                    take_i8(&p(&format!("{s}.weight")))?,
                    take_f(&p(&format!("{s}.bias")))?,
                ))
            };
            let q = lin("attention.self.query")?;
            let k = lin("attention.self.key")?;
            let v = lin("attention.self.value")?;
            let o = lin("attention.output.dense")?;
            let ff1 = lin("intermediate.dense")?;
            let ff2 = lin("output.dense")?;
            layers.push(Layer {
                q,
                k,
                v,
                o,
                ff1,
                ff2,
                ln1: (
                    take_f(&p("attention.output.LayerNorm.weight"))?,
                    take_f(&p("attention.output.LayerNorm.bias"))?,
                ),
                ln2: (
                    take_f(&p("output.LayerNorm.weight"))?,
                    take_f(&p("output.LayerNorm.bias"))?,
                ),
            });
        }
        let vocab: Vec<u32> = h["vocab"]
            .as_array()
            .ok_or("vocab がありません")?
            .iter()
            .filter_map(|v| v.as_u64().map(|v| v as u32))
            .collect();
        let rows: HashMap<u32, usize> = vocab.iter().enumerate().map(|(i, &id)| (id, i)).collect();
        let unk = num("unkTokenId")? as u32;
        let word = take_i8("embeddings.word_embeddings.weight")?;
        let position = take_f("embeddings.position_embeddings.weight")?;
        let enc = TextEncoder {
            tokenizer,
            unk_row: *rows.get(&unk).ok_or("<unk> が語彙にありません")?,
            rows,
            position,
            token_type: take_f("embeddings.token_type_embeddings.weight")?,
            ln0: (
                take_f("embeddings.LayerNorm.weight")?,
                take_f("embeddings.LayerNorm.bias")?,
            ),
            layers,
            hidden,
            heads,
            eps: h["layerNormEps"].as_f64().unwrap_or(1e-12) as f32,
            max_length: num("maxLength")?,
            position_start: num("positionStart")?,
            max_positions: num("maxPositions")?,
            word,
        };
        if enc.word.inp != hidden
            || enc.word.out != vocab.len()
            || hidden % heads != 0
            || enc.position.len() != enc.max_positions * hidden
        {
            return Err("重みの大きさが合いません".into());
        }
        Ok(enc)
    }

    pub fn dim(&self) -> usize {
        self.hidden
    }

    /// 複数の文字列をベクトルにする (CPU のスレッドに分けて計算する)。失敗した文字列は 0 のベクトル
    pub fn encode_all(&self, texts: &[String]) -> Vec<Vec<f32>> {
        let threads = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(1)
            .clamp(1, 8);
        let chunk = texts.len().div_ceil(threads).max(1);
        let mut out = vec![Vec::new(); texts.len()];
        std::thread::scope(|s| {
            for (part, slot) in texts.chunks(chunk).zip(out.chunks_mut(chunk)) {
                s.spawn(move || {
                    for (t, o) in part.iter().zip(slot.iter_mut()) {
                        *o = self.encode(t).unwrap_or_else(|_| vec![0.0; self.hidden]);
                    }
                });
            }
        });
        out
    }

    /// 1 つの文字列をベクトルにする (平均プーリング)
    pub fn encode(&self, text: &str) -> Result<Vec<f32>, String> {
        let enc = self
            .tokenizer
            .encode(text, true)
            .map_err(|e| e.to_string())?;
        let mut ids: Vec<u32> = enc.get_ids().to_vec();
        if ids.len() > self.max_length {
            // 学習時と同じく最大長で切る (最後の </s> は残す)
            let last = *ids.last().unwrap();
            ids.truncate(self.max_length - 1);
            ids.push(last);
        }
        let (n, d) = (ids.len(), self.hidden);
        if n == 0 || self.position_start + n > self.max_positions {
            return Err("長さが合いません".into());
        }
        let mut x = vec![0.0f32; n * d];
        for (i, id) in ids.iter().enumerate() {
            let r = *self.rows.get(id).unwrap_or(&self.unk_row);
            let row = &mut x[i * d..(i + 1) * d];
            let (q, s) = (&self.word.q[r * d..(r + 1) * d], self.word.scale[r]);
            let p =
                &self.position[(self.position_start + i) * d..(self.position_start + i + 1) * d];
            for j in 0..d {
                row[j] = f32::from(q[j]) * s + p[j] + self.token_type[j];
            }
        }
        layer_norm(&mut x, d, &self.ln0, self.eps);
        for l in &self.layers {
            x = self.layer(l, &x, n);
        }
        let mut v = vec![0.0f32; d];
        for i in 0..n {
            for (a, b) in v.iter_mut().zip(&x[i * d..(i + 1) * d]) {
                *a += b;
            }
        }
        Ok(v.into_iter().map(|a| a / n as f32).collect())
    }

    fn layer(&self, l: &Layer, x: &[f32], n: usize) -> Vec<f32> {
        let (d, h) = (self.hidden, self.heads);
        let dh = d / h;
        let (q, k, v) = (
            linear8(x, n, &l.q),
            linear8(x, n, &l.k),
            linear8(x, n, &l.v),
        );
        let scale = 1.0 / (dh as f32).sqrt();
        let mut y = vec![0.0f32; n * d];
        for head in 0..h {
            let at = |m: &[f32], i: usize| m[i * d + head * dh..i * d + head * dh + dh].to_vec();
            for i in 0..n {
                let qi = at(&q, i);
                let scores: Vec<f32> = (0..n)
                    .map(|j| {
                        qi.iter()
                            .zip(&k[j * d + head * dh..j * d + head * dh + dh])
                            .map(|(a, b)| a * b)
                            .sum::<f32>()
                            * scale
                    })
                    .collect();
                let m = scores.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
                let e: Vec<f32> = scores.iter().map(|s| (s - m).exp()).collect();
                let sum: f32 = e.iter().sum();
                for (j, a) in e.iter().enumerate() {
                    let w = a / sum;
                    for (o, vv) in y[i * d + head * dh..i * d + head * dh + dh]
                        .iter_mut()
                        .zip(&v[j * d + head * dh..j * d + head * dh + dh])
                    {
                        *o += w * vv;
                    }
                }
            }
        }
        let mut x1: Vec<f32> = linear8(&y, n, &l.o)
            .iter()
            .zip(x)
            .map(|(a, b)| a + b)
            .collect();
        layer_norm(&mut x1, d, &l.ln1, self.eps);
        let mut f = linear8(&x1, n, &l.ff1);
        for a in f.iter_mut() {
            *a = gelu_erf(*a);
        }
        let mut x2: Vec<f32> = linear8(&f, n, &l.ff2)
            .iter()
            .zip(&x1)
            .map(|(a, b)| a + b)
            .collect();
        layer_norm(&mut x2, d, &l.ln2, self.eps);
        x2
    }
}

/// y = x W^T + b (W は行ごとの8ビット)。行を一度だけ float に直して全トークンで使い、8 本に分けて足す (自動でベクトル化される)
fn linear8(x: &[f32], n: usize, (w, b): &(Int8, Vec<f32>)) -> Vec<f32> {
    let (inp, out) = (w.inp, w.out);
    let mut y = vec![0.0f32; n * out];
    let mut row = vec![0.0f32; inp];
    for o in 0..out {
        for (r, &q) in row.iter_mut().zip(&w.q[o * inp..(o + 1) * inp]) {
            *r = f32::from(q);
        }
        for i in 0..n {
            y[i * out + o] = dot(&x[i * inp..(i + 1) * inp], &row) * w.scale[o] + b[o];
        }
    }
    y
}

fn dot(a: &[f32], b: &[f32]) -> f32 {
    let mut acc = [0.0f32; 8];
    let ((ca, ra), (cb, rb)) = (a.as_chunks::<8>(), b.as_chunks::<8>());
    for (x, y) in ca.iter().zip(cb) {
        for k in 0..8 {
            acc[k] += x[k] * y[k];
        }
    }
    acc.iter().sum::<f32>() + ra.iter().zip(rb).map(|(x, y)| x * y).sum::<f32>()
}

fn layer_norm(x: &mut [f32], d: usize, (w, b): &(Vec<f32>, Vec<f32>), eps: f32) {
    for row in x.chunks_mut(d) {
        let m = row.iter().sum::<f32>() / d as f32;
        let v = row.iter().map(|a| (a - m) * (a - m)).sum::<f32>() / d as f32;
        let inv = 1.0 / (v + eps).sqrt();
        for ((a, ww), bb) in row.iter_mut().zip(w).zip(b) {
            *a = (*a - m) * inv * ww + bb;
        }
    }
}

/// GELU (誤差関数による厳密な形。BERT・nn.GELU() の既定と同じ)
pub fn gelu_erf(x: f32) -> f32 {
    0.5 * x * (1.0 + erf(x as f64 / std::f64::consts::SQRT_2) as f32)
}

/// 誤差関数 (W. J. Cody の有理近似と同程度の精度を持つ、Numerical Recipes の erfc 近似。相対誤差 1.2e-7 未満)
fn erf(x: f64) -> f64 {
    let z = x.abs();
    let t = 1.0 / (1.0 + 0.5 * z);
    let r = t
        * (-z * z - 1.265_512_23
            + t * (1.000_023_68
                + t * (0.374_091_96
                    + t * (0.096_784_18
                        + t * (-0.186_288_06
                            + t * (0.278_868_07
                                + t * (-1.135_203_98
                                    + t * (1.488_515_87
                                        + t * (-0.822_152_23 + t * 0.170_872_77)))))))))
            .exp();
    if x >= 0.0 {
        1.0 - r
    } else {
        r - 1.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn erf_matches_known_values() {
        for (x, want) in [
            (0.0, 0.0),
            (0.5, 0.520_499_877_8),
            (1.0, 0.842_700_792_9),
            (-1.5, -0.966_105_146_5),
            (3.0, 0.999_977_909_5),
        ] {
            assert!((erf(x) - want).abs() < 2e-7, "erf({x}) = {}", erf(x));
        }
    }
}
