//! 通信の途切れへの対策と観測 (#131)。
//! - 協力プレイ中だけ Wi-Fi のメディアストリーミングモードを有効にする (背景の走査・省電力を控えさせる。PC の設定は書き換えない)
//! - 既定の音の出力先が Bluetooth かを調べる (Bluetooth の音声は Wi-Fi と無線を分け合い、通信が周期的に止まる)
//! - スマホからの受信の「止まってからまとめて届く」途切れを数える

/// スマホ 1 台分の受信の観測。150ms 以上空いた直後に 3 件以上が 10ms 以内にまとめて届いたら、途切れ 1 回と数える
/// (無線が止まって溜まった分が一度に届く形。何も送っていないだけの空白は、まとめて届かないので数えない)
#[derive(Default, Clone)]
pub struct Arrivals {
    last: u64,
    gap: u64,
    burst: u32,
    pub stalls: u32,
    pub max_stall: u64,
}

impl Arrivals {
    pub const GAP_MS: u64 = 150;
    const BURST_MS: u64 = 10;
    const BURST_COUNT: u32 = 3;

    pub fn observe(&mut self, now: u64) {
        if self.last == 0 {
            self.last = now;
            return;
        }
        let d = now.saturating_sub(self.last);
        self.last = now;
        if d >= Self::GAP_MS {
            self.gap = d;
            self.burst = 1;
        } else if d <= Self::BURST_MS && self.gap > 0 {
            self.burst += 1;
            if self.burst == Self::BURST_COUNT {
                self.stalls += 1;
                self.max_stall = self.max_stall.max(self.gap);
            }
        } else {
            self.gap = 0;
            self.burst = 0;
        }
    }

    /// 集計を取り出して数え直す (受信の時刻は続けて使う)
    pub fn take(&mut self) -> (u32, u64) {
        let r = (self.stalls, self.max_stall);
        self.stalls = 0;
        self.max_stall = 0;
        r
    }
}

pub use imp::{bluetooth_audio, StreamingMode};

#[cfg(windows)]
mod imp {
    use std::ffi::c_void;

    use windows::core::{BOOL, GUID, PWSTR};
    use windows::Win32::Foundation::{HANDLE, PROPERTYKEY};
    use windows::Win32::Media::Audio::{eConsole, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
    use windows::Win32::NetworkManagement::WiFi::{
        wlan_intf_opcode_media_streaming_mode, WlanCloseHandle, WlanEnumInterfaces, WlanFreeMemory, WlanOpenHandle, WlanSetInterface,
        WLAN_INTERFACE_INFO_LIST,
    };
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_ALL, COINIT_MULTITHREADED, STGM_READ};
    use windows::Win32::System::Com::StructuredStorage::PropVariantToStringAlloc;

    /// Wi-Fi のメディアストリーミングモード。開いたハンドルを持っている間だけ有効で、閉じると元に戻る。
    /// ハンドルはホストのスレッドだけで使うが、Hub ごとスレッドへ移すため数値で持つ
    pub struct StreamingMode {
        handle: Option<usize>,
    }

    impl StreamingMode {
        pub fn new() -> StreamingMode {
            StreamingMode { handle: None }
        }

        /// 有効にする。Wi-Fi のアダプターが 1 つでも受け付ければ true
        pub fn enable(&mut self) -> bool {
            if self.handle.is_some() {
                return true;
            }
            unsafe {
                let mut version = 0u32;
                let mut handle = HANDLE::default();
                if WlanOpenHandle(2, None, &mut version, &mut handle) != 0 {
                    return false;
                }
                let mut list: *mut WLAN_INTERFACE_INFO_LIST = std::ptr::null_mut();
                if WlanEnumInterfaces(handle, None, &mut list) != 0 || list.is_null() {
                    let _ = WlanCloseHandle(handle, None);
                    return false;
                }
                let on = BOOL(1);
                let mut ok = false;
                let count = (*list).dwNumberOfItems as usize;
                let items = std::slice::from_raw_parts((*list).InterfaceInfo.as_ptr(), count);
                for info in items {
                    let r = WlanSetInterface(
                        handle,
                        &info.InterfaceGuid,
                        wlan_intf_opcode_media_streaming_mode,
                        std::mem::size_of::<BOOL>() as u32,
                        (&on as *const BOOL).cast::<c_void>(),
                        None,
                    );
                    ok |= r == 0;
                }
                WlanFreeMemory(list.cast());
                if ok {
                    self.handle = Some(handle.0 as usize);
                } else {
                    let _ = WlanCloseHandle(handle, None);
                }
                ok
            }
        }

        pub fn disable(&mut self) {
            if let Some(h) = self.handle.take() {
                unsafe {
                    let _ = WlanCloseHandle(HANDLE(h as *mut c_void), None);
                }
            }
        }
    }

    impl Drop for StreamingMode {
        fn drop(&mut self) {
            self.disable();
        }
    }

    /// 既定の音の出力先が Bluetooth か (デバイスの列挙元 PKEY_Device_EnumeratorName が BTHENUM・BTHLE)。
    /// 調べられないときは None。音の内容は読まない
    pub fn bluetooth_audio() -> Option<bool> {
        // PKEY_Device_EnumeratorName
        let key = PROPERTYKEY { fmtid: GUID::from_u128(0xa45c254e_df1c_4efd_8020_67d146a850e0), pid: 24 };
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let devices: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok()?;
            let device = devices.GetDefaultAudioEndpoint(eRender, eConsole).ok()?;
            let store = device.OpenPropertyStore(STGM_READ).ok()?;
            let value = store.GetValue(&key).ok()?;
            let text: PWSTR = PropVariantToStringAlloc(&value).ok()?;
            let name = text.to_string().unwrap_or_default();
            CoTaskMemFree(Some(text.0 as *const c_void));
            let name = name.to_ascii_uppercase();
            Some(name == "BTHENUM" || name.starts_with("BTHLE"))
        }
    }
}

#[cfg(not(windows))]
mod imp {
    pub struct StreamingMode;
    impl StreamingMode {
        pub fn new() -> StreamingMode {
            StreamingMode
        }
        pub fn enable(&mut self) -> bool {
            false
        }
        pub fn disable(&mut self) {}
    }
    pub fn bluetooth_audio() -> Option<bool> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_stall_only_when_messages_bunch_after_gap() {
        let mut a = Arrivals::default();
        // 30ms ごとに届く (途切れなし)
        for t in (1000..1300).step_by(30) {
            a.observe(t);
        }
        assert_eq!(a.take(), (0, 0));
        // 400ms 止まってから 4 件がまとめて届く → 1 回
        a.observe(1700);
        a.observe(1702);
        a.observe(1703);
        a.observe(1705);
        // 何も送っていない 1 秒の空白の後、1 件だけ (ping) → 数えない
        a.observe(2705);
        a.observe(3705);
        // 250ms 止まって 3 件 → もう 1 回
        a.observe(3955);
        a.observe(3958);
        a.observe(3960);
        assert_eq!(a.take(), (2, 430), "最大の空白は 1270→1700 の 430ms");
    }
}
