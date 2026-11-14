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
                Some(Address {
                    hotspot: address.starts_with("192.168.137."),
                    name: i.name,
                    address,
                })
            }
            _ => None,
        })
        .collect();
    list.sort_by_key(|a| !a.hotspot);
    list
}

fn qr_svg(data: &str) -> String {
    match QrCode::new(data.as_bytes()) {
        Ok(code) => code
            .render::<svg::Color>()
            .quiet_zone(true)
            .module_dimensions(4, 4)
            .build(),
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

struct HotspotLifecycle {
    owned: Option<imp::OwnedHotspot>,
    fake_owned: bool,
}

static LIFECYCLE: std::sync::Mutex<HotspotLifecycle> = std::sync::Mutex::new(HotspotLifecycle {
    owned: None,
    fake_owned: false,
});
static SHUTTING_DOWN: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

fn fake_hotspot() -> Option<Hotspot> {
    let fake = std::env::var("RECOOPLAY_FAKE_HOTSPOT").ok()?;
    let mut parts = fake.splitn(3, '|');
    Some(Hotspot {
        ssid: parts.next()?.into(),
        passphrase: parts.next()?.into(),
        on: parts.next() == Some("on"),
    })
}

/// ホットスポットの設定と ON・OFF を読む。インターネット接続がない・読めない環境では None。
/// 試験 (dry-run) では本物を読まず、RECOOPLAY_FAKE_HOTSPOT="SSID|パスフレーズ|on|off" を使う
pub fn hotspot() -> Option<Hotspot> {
    if std::env::var("RECOOPLAY_DRY_RUN").as_deref() == Ok("1") {
        let mut spot = fake_hotspot()?;
        spot.on |= LIFECYCLE.lock().ok()?.fake_owned;
        return Some(spot);
    }
    imp::hotspot()
}

/// ホットスポットを ON にする (PC 画面のボタンを押したときだけ)。
pub fn start_hotspot() -> Result<(), String> {
    let mut lifecycle = LIFECYCLE
        .lock()
        .map_err(|_| "ホットスポットの状態を取得できません")?;
    if SHUTTING_DOWN.load(std::sync::atomic::Ordering::Relaxed) {
        return Err("PCアプリは終了中です".into());
    }
    if std::env::var("RECOOPLAY_DRY_RUN").as_deref() == Ok("1") {
        lifecycle.fake_owned |= fake_hotspot().is_some_and(|spot| !spot.on);
        return Ok(());
    }
    if let Some(owned) = imp::start_hotspot()? {
        lifecycle.owned = Some(owned);
    }
    Ok(())
}

pub fn block_hotspot_start() {
    SHUTTING_DOWN.store(true, std::sync::atomic::Ordering::Relaxed);
}

/// Windowsの処理や実行中の起動要求を待ち続けない。終了ログには固定の結果だけを書く。
pub fn stop_owned_hotspot() -> &'static str {
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    let worker = std::thread::Builder::new()
        .name("hotspot-stop".into())
        .spawn(move || {
            let result = match LIFECYCLE.lock() {
                Ok(mut lifecycle) if lifecycle.fake_owned => {
                    lifecycle.fake_owned = false;
                    "stopped"
                }
                Ok(mut lifecycle) => match lifecycle.owned.take() {
                    Some(owned) => {
                        if imp::stop_hotspot(owned) {
                            "stopped"
                        } else {
                            "failed"
                        }
                    }
                    None => "notOwned",
                },
                Err(_) => "failed",
            };
            let _ = tx.send(result);
        });
    if worker.is_err() {
        return "failed";
    }
    rx.recv_timeout(std::time::Duration::from_secs(2))
        .unwrap_or_else(|err| match err {
            std::sync::mpsc::RecvTimeoutError::Timeout => "timeout",
            std::sync::mpsc::RecvTimeoutError::Disconnected => "failed",
        })
}

#[cfg(windows)]
mod imp {
    use windows::core::AgileReference;
    use windows::Networking::Connectivity::NetworkInformation;
    use windows::Networking::NetworkOperators::{
        NetworkOperatorTetheringManager, TetheringOperationStatus, TetheringOperationalState,
    };
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

    pub type OwnedHotspot = AgileReference<NetworkOperatorTetheringManager>;

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

    pub fn start_hotspot() -> Result<Option<OwnedHotspot>, String> {
        let m = manager()
            .ok_or("インターネットに接続していないため、ホットスポットをONにできません")?;
        match m.TetheringOperationalState() {
            Ok(TetheringOperationalState::On) => return Ok(None),
            Ok(TetheringOperationalState::Off) => {}
            _ => {
                return Err(
                    "ホットスポットの状態を確認できません。Windowsの設定から確認してください"
                        .into(),
                )
            }
        }
        let owned = AgileReference::new(&m).map_err(|e| e.message())?;
        let result = m
            .StartTetheringAsync()
            .and_then(|op| op.join())
            .map_err(|e| e.message())?;
        match result.Status() {
            Ok(TetheringOperationStatus::Success) => Ok(Some(owned)),
            Ok(TetheringOperationStatus::AlreadyOn) => Ok(None),
            _ => Err(result
                .AdditionalErrorMessage()
                .map(|m| m.to_string())
                .ok()
                .filter(|m| !m.is_empty())
                .unwrap_or_else(|| {
                    "ホットスポットをONにできませんでした。Windowsの設定から確認してください".into()
                })),
        }
    }

    pub fn stop_hotspot(owned: OwnedHotspot) -> bool {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        let Ok(m) = owned.resolve() else { return false };
        match m.TetheringOperationalState() {
            Ok(TetheringOperationalState::Off) => return true,
            Ok(TetheringOperationalState::On) => {}
            _ => return false,
        }
        m.StopTetheringAsync()
            .and_then(|op| op.join())
            .and_then(|result| result.Status())
            .is_ok_and(|status| status == TetheringOperationStatus::Success)
    }
}

#[cfg(not(windows))]
mod imp {
    pub type OwnedHotspot = std::convert::Infallible;
    pub fn hotspot() -> Option<super::Hotspot> {
        None
    }
    pub fn start_hotspot() -> Result<Option<OwnedHotspot>, String> {
        Err("Windows以外ではホットスポットを扱えません".into())
    }
    pub fn stop_hotspot(owned: OwnedHotspot) -> bool {
        match owned {}
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
        let payload = format!(
            "WIFI:T:WPA;S:{};P:{};;",
            escape_wifi(ssid),
            escape_wifi(password)
        );
        json!({ "ssid": ssid, "qr": qr_svg(&payload) })
    });
    let hotspot = spot.map(|h| json!({ "on": h.on }));
    json!({ "port": port, "urls": urls, "wifi": wifi, "hotspot": hotspot })
}
