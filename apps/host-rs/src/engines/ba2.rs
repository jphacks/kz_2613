// Bethesda の BA2 アーカイブ (GNRL 形式：Fallout 4・Starfield) から、名前で 1 つのファイルを取り出す (#527)。
// 形式：「BTDX」+ 版 (u32) +「GNRL」+ ファイル数 (u32) + 名前の表の位置 (u64)、
// 続いてファイルごとに 36 バイト (名前のハッシュ u32・拡張子 4 バイト・フォルダのハッシュ u32・フラグ u32・
// 位置 u64・圧縮後の大きさ u32 (0 なら無圧縮)・元の大きさ u32・区切り u32)。名前の表は (長さ u16 + 名前) の並び。
// 圧縮は zlib だけ読む (Starfield の一部の LZ4 などは読まない)。ほかの形式 (DX10 の画像など) は読まない。
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

/// 取り出すファイルの上限
const MAX_ENTRY: usize = 16 * 1024 * 1024;
/// 読むファイル数の上限 (壊れたアーカイブで止まらないように)
const MAX_FILES: usize = 1_000_000;

fn u16_le(b: &[u8], o: usize) -> Option<usize> {
    Some(u16::from_le_bytes(b.get(o..o + 2)?.try_into().ok()?) as usize)
}
fn u32_le(b: &[u8], o: usize) -> Option<usize> {
    Some(u32::from_le_bytes(b.get(o..o + 4)?.try_into().ok()?) as usize)
}
fn u64_le(b: &[u8], o: usize) -> Option<u64> {
    Some(u64::from_le_bytes(b.get(o..o + 8)?.try_into().ok()?))
}

/// アーカイブから、名前 (大文字と小文字・区切りの向きを問わない) が合うファイルを取り出す
pub fn extract(path: &Path, want: &str) -> Option<Vec<u8>> {
    let mut f = std::fs::File::open(path).ok()?;
    let size = f.metadata().ok()?.len();
    // 先頭 (24 バイト) と、ファイルの記録の位置
    let mut head = [0u8; 24];
    f.read_exact(&mut head).ok()?;
    if &head[0..4] != b"BTDX" || &head[8..12] != b"GNRL" {
        return None;
    }
    let count = u32_le(&head, 12)?;
    let names_at = u64_le(&head, 16)?;
    if count == 0 || count > MAX_FILES || names_at >= size {
        return None;
    }
    // 版 2・3 (Starfield) は先頭が長い。記録の始まりは名前の表から逆算せず、版で決める
    let version = u32_le(&head, 4)?;
    let records_at: u64 = match version {
        1 | 7 | 8 => 24,
        2 => 32,
        3 => 36,
        _ => return None,
    };
    let mut records = vec![0u8; count * 36];
    f.seek(SeekFrom::Start(records_at)).ok()?;
    f.read_exact(&mut records).ok()?;
    // 名前の表
    f.seek(SeekFrom::Start(names_at)).ok()?;
    let mut names = Vec::new();
    f.take(size - names_at).read_to_end(&mut names).ok()?;
    let want = want.replace('\\', "/").to_ascii_lowercase();
    let mut o = 0;
    for i in 0..count {
        let len = u16_le(&names, o)?;
        let name = String::from_utf8_lossy(names.get(o + 2..o + 2 + len)?)
            .replace('\\', "/")
            .to_ascii_lowercase();
        o += 2 + len;
        if name != want {
            continue;
        }
        let r = &records[i * 36..i * 36 + 36];
        let offset = u64_le(r, 16)?;
        let packed = u32_le(r, 24)?;
        let unpacked = u32_le(r, 28)?;
        if unpacked > MAX_ENTRY {
            return None;
        }
        let stored = if packed == 0 { unpacked } else { packed };
        let mut data = vec![0u8; stored];
        let mut f = std::fs::File::open(path).ok()?;
        f.seek(SeekFrom::Start(offset)).ok()?;
        f.read_exact(&mut data).ok()?;
        if packed == 0 {
            return Some(data);
        }
        let mut out = Vec::with_capacity(unpacked);
        flate2::read::ZlibDecoder::new(&data[..])
            .take(MAX_ENTRY as u64 + 1)
            .read_to_end(&mut out)
            .ok()?;
        return (out.len() <= MAX_ENTRY).then_some(out);
    }
    None
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use std::io::Write;

    /// 試験用の BA2 (GNRL、版 1) を作る
    pub fn make_ba2(files: &[(&str, &[u8])], compress: bool) -> Vec<u8> {
        let header_len = 24usize;
        let records_len = files.len() * 36;
        let mut bodies: Vec<(Vec<u8>, usize)> = Vec::new();
        for (_, data) in files {
            if compress {
                let mut e =
                    flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
                e.write_all(data).unwrap();
                bodies.push((e.finish().unwrap(), data.len()));
            } else {
                bodies.push((data.to_vec(), data.len()));
            }
        }
        let mut offset = header_len + records_len;
        let mut records = Vec::new();
        for (body, unpacked) in &bodies {
            records.extend([0u8; 4]);
            records.extend(b"txt\0");
            records.extend([0u8; 4]);
            records.extend(0u32.to_le_bytes());
            records.extend((offset as u64).to_le_bytes());
            records.extend((if compress { body.len() as u32 } else { 0 }).to_le_bytes());
            records.extend((*unpacked as u32).to_le_bytes());
            records.extend(0xBAADF00Du32.to_le_bytes());
            offset += body.len();
        }
        let names_at = offset as u64;
        let mut out = b"BTDX".to_vec();
        out.extend(1u32.to_le_bytes());
        out.extend(b"GNRL");
        out.extend((files.len() as u32).to_le_bytes());
        out.extend(names_at.to_le_bytes());
        out.extend(records);
        for (body, _) in &bodies {
            out.extend(body);
        }
        for (name, _) in files {
            out.extend((name.len() as u16).to_le_bytes());
            out.extend(name.as_bytes());
        }
        out
    }

    #[test]
    fn extracts_stored_and_zlib_files_by_name() {
        let dir = std::env::temp_dir().join(format!("recooplay-ba2-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        for compress in [false, true] {
            let p = dir.join(format!("t{compress}.ba2"));
            std::fs::write(
                &p,
                make_ba2(
                    &[
                        ("Interface\\Other.txt", b"x"),
                        ("Interface\\Controls\\PC\\ControlMap.txt", b"Forward\t0x11"),
                    ],
                    compress,
                ),
            )
            .unwrap();
            assert_eq!(
                extract(&p, "interface/controls/pc/controlmap.txt").unwrap(),
                b"Forward\t0x11"
            );
            assert!(extract(&p, "missing.txt").is_none());
        }
        let bad = dir.join("bad.ba2");
        std::fs::write(&bad, b"BTDX\x01\0\0\0DX10").unwrap();
        assert!(
            extract(&bad, "x").is_none(),
            "画像のアーカイブ (DX10) は読まない"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
