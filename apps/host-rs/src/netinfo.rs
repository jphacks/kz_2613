// ネットワーク情報と参加用 QR
// ホットスポットの IP (通常 192.168.137.1) はホットスポットを ON にしたタイミングで現れるので毎回取り直す

use qrcode::render::svg;
use qrcode::QrCode;
use serde_json::{json, Value};

pub struct Address {
    pub name: String,
    pub address: String,
    pub hotspot: bool,
}

pub fn addresses() -> Vec<Address> {
    let mut list: Vec<Address> = if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter(|i| !i.is_loopback())
        .filter_map(|i| match i.ip() {
            std::net::IpAddr::V4(v4) => {
                let address = v4.to_string();
                Some(Address { hotspot: address.starts_with("192.168.137."), name: i.name, address })
            }
            _ => None,
        })
        .collect();
    list.sort_by_key(|a| !a.hotspot);
    list
}

fn qr_svg(data: &str) -> String {
    match QrCode::new(data.as_bytes()) {
        Ok(code) => code.render::<svg::Color>().quiet_zone(true).module_dimensions(4, 4).build(),
        Err(_) => String::new(),
    }
}

fn escape_wifi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        if matches!(c, '\\' | ';' | ',' | ':' | '"') {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

/// PC のモバイルホットスポット (#133)。SSID とパスフレーズは PC 本体の画面にだけ渡し、ログには残さない
pub struct Hotspot {
    pub ssid: String,
    pub passphrase: String,
    pub on: bool,
}

/// ホットスポットの設定と ON・OFF を読む。インターネット接続がない・読めない環境では None。
/// 試験 (dry-run) では本物を読まず、RECOOPLAY_FAKE_HOTSPOT="SSID|パスフレーズ|on|off" を使う
pub fn hotspot() -> Option<Hotspot> {
    if std::env::var("RECOOPLAY_DRY_RUN").as_deref() == Ok("1") {
        let fake = std::env::var("RECOOPLAY_FAKE_HOTSPOT").ok()?;
        let mut parts = fake.splitn(3, '|');
        return Some(Hotspot { ssid: parts.next()?.into(), passphrase: parts.next()?.into(), on: parts.next() == Some("on") });
    }
    imp::hotspot()
}

/// ホットスポットを ON にする (PC 画面のボタンを押したときだけ)。dry-run では何もしない
pub fn start_hotspot() -> Result<(), String> {
    if std::env::var("RECOOPLAY_DRY_RUN").as_deref() == Ok("1") {
        return Ok(());
    }
    imp::start_hotspot()
}

#[cfg(windows)]
mod imp {
    use windows::Networking::Connectivity::NetworkInformation;
    use windows::Networking::NetworkOperators::{NetworkOperatorTetheringManager, TetheringOperationStatus, TetheringOperationalState};
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

    fn manager() -> Option<NetworkOperatorTetheringManager> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        // 共有するインターネット接続 (今の接続) からホットスポットの管理を得る
        let profile = NetworkInformation::GetInternetConnectionProfile().ok()?;
        NetworkOperatorTetheringManager::CreateFromConnectionProfile(&profile).ok()
    }

    pub fn hotspot() -> Option<super::Hotspot> {
        let m = manager()?;
        let cfg = m.GetCurrentAccessPointConfiguration().ok()?;
        Some(super::Hotspot {
            ssid: cfg.Ssid().ok()?.to_string(),
            passphrase: cfg.Passphrase().ok()?.to_string(),
            on: m.TetheringOperationalState().ok()? == TetheringOperationalState::On,
        })
    }

    pub fn start_hotspot() -> Result<(), String> {
        let m = manager().ok_or("インターネットに接続していないため、ホットスポットをONにできません")?;
        let result = m.StartTetheringAsync().and_then(|op| op.join()).map_err(|e| e.message())?;
        match result.Status() {
            Ok(TetheringOperationStatus::Success) => Ok(()),
            _ => Err(result.AdditionalErrorMessage().map(|m| m.to_string()).ok().filter(|m| !m.is_empty())
                .unwrap_or_else(|| "ホットスポットをONにできませんでした。Windowsの設定から確認してください".into())),
        }
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn hotspot() -> Option<super::Hotspot> {
        None
    }
    pub fn start_hotspot() -> Result<(), String> {
        Err("Windows以外ではホットスポットを扱えません".into())
    }
}

/// 参加の案内 (QR・URL)。Wi-Fi の情報 (パスフレーズを含む QR) は PC 本体 (loopback) にだけ含める (#133)。
/// Wi-Fi はホットスポットの設定を優先し、読めなければ config.json の wifi を使う
pub fn info(port: u16, wifi: Option<(&str, &str)>, loopback: bool) -> Value {
    let urls: Vec<Value> = addresses()
        .into_iter()
        .map(|a| {
            let url = format!("http://{}:{}/", a.address, port);
            json!({ "name": a.name, "address": a.address, "hotspot": a.hotspot, "qr": qr_svg(&url), "url": url })
        })
        .collect();
    if !loopback {
        return json!({ "port": port, "urls": urls, "wifi": null, "hotspot": null });
    }
    let spot = hotspot();
    let wifi = match &spot {
        Some(h) => Some((h.ssid.as_str(), h.passphrase.as_str())),
        None => wifi,
    }
    .map(|(ssid, password)| {
        let payload = format!("WIFI:T:WPA;S:{};P:{};;", escape_wifi(ssid), escape_wifi(password));
        json!({ "ssid": ssid, "qr": qr_svg(&payload) })
    });
    let hotspot = spot.map(|h| json!({ "on": h.on }));
    json!({ "port": port, "urls": urls, "wifi": wifi, "hotspot": hotspot })
}
