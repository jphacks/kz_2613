fn main() {
    // 差し替えた画像を増分ビルドでもWindowsリソースへ反映する。
    for icon in ["icons/icon.ico", "icons/32x32.png", "icons/128x128.png", "icons/icon.png"] {
        println!("cargo:rerun-if-changed={icon}");
    }
    tauri_build::build()
}
