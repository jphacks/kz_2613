// エンジンの読み取りで使う、最小の zip の読み取り (CryEngine の pak など)。
// 中央ディレクトリから項目を探し、保存 (0) と Deflate (8) だけを展開する。暗号化された項目・ほかの圧縮は読まない。
// exe の後ろに付けた zip のように、先頭に別のデータがあっても読めるよう、オフセットのずれを中央ディレクトリの位置から求める。
use std::io::Read;

/// 1 つの項目を展開したときの上限 (設定・スクリプトは数 MB 以内)
const MAX_ENTRY: usize = 16 * 1024 * 1024;

#[derive(Clone, Debug)]
pub struct Entry {
    pub name: String,
    method: u16,
    flags: u16,
    compressed: usize,
    size: usize,
    local: usize,
}

fn u16_at(b: &[u8], o: usize) -> Option<u16> {
    Some(u16::from_le_bytes(b.get(o..o + 2)?.try_into().ok()?))
}

fn u32_at(b: &[u8], o: usize) -> Option<usize> {
    Some(u32::from_le_bytes(b.get(o..o + 4)?.try_into().ok()?) as usize)
}

/// 中央ディレクトリの項目の一覧 (zip でなければ空)
pub fn entries(b: &[u8]) -> Vec<Entry> {
    // 終端レコード (PK\x05\x06) を後ろから探す (コメントは 64 KB まで)
    let start = b.len().saturating_sub(65_557);
    let Some(eocd) = (start..b.len().saturating_sub(21))
        .rev()
        .find(|&i| b[i..i + 4] == *b"PK\x05\x06")
    else {
        return Vec::new();
    };
    let (Some(count), Some(cd_size), Some(cd_offset)) = (
        u16_at(b, eocd + 10),
        u32_at(b, eocd + 12),
        u32_at(b, eocd + 16),
    ) else {
        return Vec::new();
    };
    // exe の後ろに付けた zip：中央ディレクトリは終端レコードの直前にある
    let Some(cd) = eocd.checked_sub(cd_size) else {
        return Vec::new();
    };
    let Some(base) = cd.checked_sub(cd_offset) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    let mut o = cd;
    for _ in 0..count {
        if b.get(o..o + 4) != Some(b"PK\x01\x02") {
            break;
        }
        let (
            Some(flags),
            Some(method),
            Some(compressed),
            Some(size),
            Some(nlen),
            Some(xlen),
            Some(clen),
            Some(local),
        ) = (
            u16_at(b, o + 8),
            u16_at(b, o + 10),
            u32_at(b, o + 20),
            u32_at(b, o + 24),
            u16_at(b, o + 28),
            u16_at(b, o + 30),
            u16_at(b, o + 32),
            u32_at(b, o + 42),
        )
        else {
            break;
        };
        let Some(name) = b.get(o + 46..o + 46 + nlen as usize) else {
            break;
        };
        out.push(Entry {
            name: String::from_utf8_lossy(name).replace('\\', "/"),
            method,
            flags,
            compressed,
            size,
            local: base + local,
        });
        o += 46 + nlen as usize + xlen as usize + clen as usize;
    }
    out
}

/// 項目を展開する (暗号化・未対応の圧縮・大きすぎるものは None)
pub fn read(b: &[u8], e: &Entry) -> Option<Vec<u8>> {
    if e.flags & 1 != 0 || e.size > MAX_ENTRY {
        return None;
    }
    if b.get(e.local..e.local + 4) != Some(b"PK\x03\x04") {
        return None;
    }
    let data_at =
        e.local + 30 + u16_at(b, e.local + 26)? as usize + u16_at(b, e.local + 28)? as usize;
    let data = b.get(data_at..data_at.checked_add(e.compressed)?)?;
    match e.method {
        0 => Some(data.to_vec()),
        8 => {
            let mut out = Vec::with_capacity(e.size.min(MAX_ENTRY));
            flate2::read::DeflateDecoder::new(data)
                .take(MAX_ENTRY as u64 + 1)
                .read_to_end(&mut out)
                .ok()?;
            (out.len() <= MAX_ENTRY).then_some(out)
        }
        _ => None,
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use std::io::Write;

    /// 試験用の zip を作る (deflate = true なら Deflate で圧縮)
    pub fn make_zip(files: &[(&str, &[u8])], deflate: bool) -> Vec<u8> {
        let mut out = Vec::new();
        let mut central = Vec::new();
        for (name, data) in files {
            let body = if deflate {
                let mut e =
                    flate2::write::DeflateEncoder::new(Vec::new(), flate2::Compression::default());
                e.write_all(data).unwrap();
                e.finish().unwrap()
            } else {
                data.to_vec()
            };
            let method: u16 = if deflate { 8 } else { 0 };
            let local = out.len() as u32;
            out.extend(b"PK\x03\x04");
            out.extend([20, 0, 0, 0]);
            out.extend(method.to_le_bytes());
            out.extend([0u8; 8]);
            out.extend((body.len() as u32).to_le_bytes());
            out.extend((data.len() as u32).to_le_bytes());
            out.extend((name.len() as u16).to_le_bytes());
            out.extend(0u16.to_le_bytes());
            out.extend(name.as_bytes());
            out.extend(&body);
            central.extend(b"PK\x01\x02");
            central.extend([20, 0, 20, 0, 0, 0]);
            central.extend(method.to_le_bytes());
            central.extend([0u8; 8]);
            central.extend((body.len() as u32).to_le_bytes());
            central.extend((data.len() as u32).to_le_bytes());
            central.extend((name.len() as u16).to_le_bytes());
            central.extend([0u8; 12]);
            central.extend(local.to_le_bytes());
            central.extend(name.as_bytes());
        }
        let cd_offset = out.len() as u32;
        out.extend(&central);
        out.extend(b"PK\x05\x06");
        out.extend([0u8; 4]);
        out.extend((files.len() as u16).to_le_bytes());
        out.extend((files.len() as u16).to_le_bytes());
        out.extend((central.len() as u32).to_le_bytes());
        out.extend(cd_offset.to_le_bytes());
        out.extend(0u16.to_le_bytes());
        out
    }

    #[test]
    fn reads_stored_and_deflated_entries_even_after_other_data() {
        for deflate in [false, true] {
            let zip = make_zip(
                &[
                    ("Libs/Config/a.xml", b"<x/>"),
                    ("b.txt", b"hello hello hello"),
                ],
                deflate,
            );
            let mut exe = b"MZ some exe bytes".to_vec();
            exe.extend(&zip);
            for bytes in [zip.clone(), exe] {
                let e = entries(&bytes);
                assert_eq!(e.len(), 2);
                assert_eq!(e[0].name, "Libs/Config/a.xml");
                assert_eq!(read(&bytes, &e[1]).unwrap(), b"hello hello hello");
            }
        }
        assert!(entries(b"not a zip").is_empty());
    }
}
