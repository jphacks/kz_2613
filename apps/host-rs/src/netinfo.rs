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

pub fn info(port: u16, wifi: Option<(&str, &str)>) -> Value {
    let urls: Vec<Value> = addresses()
        .into_iter()
        .map(|a| {
            let url = format!("http://{}:{}/", a.address, port);
            json!({ "name": a.name, "address": a.address, "hotspot": a.hotspot, "qr": qr_svg(&url), "url": url })
        })
        .collect();
    let wifi = wifi.map(|(ssid, password)| {
        let payload = format!("WIFI:T:WPA;S:{};P:{};;", escape_wifi(ssid), escape_wifi(password));
        json!({ "ssid": ssid, "qr": qr_svg(&payload) })
    });
    json!({ "port": port, "urls": urls, "wifi": wifi })
}
