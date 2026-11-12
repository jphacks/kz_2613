// JSONの解釈境界。認証・現在接続・epochの可否・順序処理はHub/sessionが決める。
// 数値文字列・小数からの整数化、未知stateの解放扱い、ACKの原値を保持する。
use serde_json::Value;

pub(crate) fn parse_json(text: &str) -> Option<Value> {
    serde_json::from_str(text).ok()
}
pub(crate) fn s(v: &Value, key: &str) -> Option<String> {
    v.get(key)?.as_str().map(str::to_string)
}
pub(crate) fn num(v: &Value, key: &str) -> Option<f64> {
    let n = v.get(key)?;
    n.as_f64()
        .or_else(|| n.as_str().and_then(|s| s.trim().parse().ok()))
}

#[derive(Debug)]
pub(crate) struct InputMessage {
    pub iseq: i64,
    pub epoch: Option<u64>,
    pub button: String,
    pub state: String,
    pub burst: bool,
    pub raw: Value,
}
impl InputMessage {
    pub(crate) fn decode(raw: Value) -> Option<Self> {
        let n = num(&raw, "iseq")?;
        if !n.is_finite() {
            return None;
        }
        Some(Self {
            iseq: n as i64,
            epoch: raw.get("epoch").and_then(Value::as_u64),
            button: s(&raw, "button").unwrap_or_default(),
            state: s(&raw, "state").unwrap_or_default(),
            burst: raw.get("burst").and_then(Value::as_bool).unwrap_or(false),
            raw,
        })
    }
}

#[derive(Debug)]
pub(crate) struct LookMessage {
    pub epoch: Option<u64>,
    pub lseq: i64,
    pub cx: f64,
    pub cy: f64,
}
impl LookMessage {
    pub(crate) fn decode(raw: &Value) -> Option<Self> {
        let lseq = num(raw, "lseq")?;
        let cx = num(raw, "cx").unwrap_or(0.0);
        let cy = num(raw, "cy").unwrap_or(0.0);
        // JSON自体はNaN/Infinityを持てないが、旧numは文字列から生成できた。
        // 視点の基準を汚染する値だけを拒否し、有限な既存の変換は保持する。
        if !lseq.is_finite() || !cx.is_finite() || !cy.is_finite() {
            return None;
        }
        Some(Self {
            epoch: raw.get("epoch").and_then(Value::as_u64),
            lseq: lseq as i64,
            cx,
            cy,
        })
    }
}

pub(crate) struct CommandMessage {
    pub cmd: String,
    pub epoch: Option<u64>,
}
impl CommandMessage {
    pub(crate) fn decode(raw: &Value) -> Self {
        Self {
            cmd: s(raw, "cmd").unwrap_or_default(),
            epoch: raw.get("epoch").and_then(Value::as_u64),
        }
    }
}

pub(crate) struct RemoteMessage {
    pub epoch: Option<u64>,
    pub seq: u64,
    pub kind: String,
    pub x: f64,
    pub y: f64,
}
impl RemoteMessage {
    pub(crate) fn decode(raw: &Value) -> Self {
        let delta = |key| {
            raw.get(key)
                .and_then(Value::as_f64)
                .filter(|n| n.is_finite())
                .unwrap_or(0.0)
                .clamp(-120.0, 120.0)
        };
        Self {
            epoch: raw.get("epoch").and_then(Value::as_u64),
            seq: raw.get("rseq").and_then(Value::as_u64).unwrap_or(0),
            kind: s(raw, "kind").unwrap_or_default(),
            x: delta("dx"),
            y: delta("dy"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn json_syntax_and_unknown_shapes_never_create_an_input() {
        for text in ["{", "{\"cx\":NaN}", "[1,", ""] {
            assert!(parse_json(text).is_none());
        }
        for raw in [
            Value::Null,
            json!([]),
            json!({}),
            json!({"iseq":true}),
            json!({"iseq":[]}),
        ] {
            assert!(InputMessage::decode(raw).is_none());
        }
        assert!(parse_json("null").is_some()); // 未知フレームの生存確認等はHub側の既存責任。
    }

    #[test]
    fn input_preserves_numeric_coercion_state_fallback_and_ack_wire_value() {
        let raw = json!({"iseq":" 12.9 ","epoch":"7","button":55,"state":"unknown","burst":"true","extra":[1,2]});
        let m = InputMessage::decode(raw.clone()).unwrap();
        assert_eq!(m.iseq, 12);
        assert_eq!(m.epoch, None);
        assert_eq!(m.button, "");
        assert_eq!(m.state, "unknown");
        assert!(!m.burst);
        assert_eq!(m.raw, raw);
        for n in [0.0, -1.0, 0.9, 1e100] {
            assert_eq!(
                InputMessage::decode(json!({"iseq":n})).unwrap().iseq,
                n as i64
            );
        }
        let m =
            InputMessage::decode(json!({"iseq":1,"epoch":7,"state":"down","burst":true})).unwrap();
        assert_eq!(m.epoch, Some(7));
        assert!(m.burst);
    }

    #[test]
    fn non_finite_strings_are_rejected_without_poisoning_look_or_order_state() {
        for n in ["NaN", "Infinity", "-Infinity", "inf", "-inf"] {
            assert!(InputMessage::decode(json!({"iseq":n})).is_none());
            for field in ["lseq", "cx", "cy"] {
                let mut raw = json!({"epoch":7,"lseq":1,"cx":2,"cy":3});
                raw[field] = json!(n);
                assert!(LookMessage::decode(&raw).is_none(), "{field}={n}");
            }
        }
    }

    #[test]
    fn look_defaults_and_finite_numeric_strings_keep_the_existing_meaning() {
        let m =
            LookMessage::decode(&json!({"epoch":7,"lseq":"3.9","cx":" -1.5 ","cy":true})).unwrap();
        assert_eq!((m.epoch, m.lseq, m.cx, m.cy), (Some(7), 3, -1.5, 0.0));
        assert!(LookMessage::decode(&json!({"epoch":7,"cx":4})).is_none());
    }

    #[test]
    fn command_and_remote_do_not_promote_untrusted_types_or_numeric_strings() {
        let c = CommandMessage::decode(&json!({"cmd":true,"epoch":"7"}));
        assert_eq!(c.cmd, "");
        assert_eq!(c.epoch, None);
        let r = RemoteMessage::decode(
            &json!({"epoch":7,"rseq":"2","kind":"move","dx":"120","dy":-500}),
        );
        assert_eq!((r.epoch, r.seq, r.x, r.y), (Some(7), 0, 0.0, -120.0));
        assert_eq!(r.kind, "move");
    }
}
