// Codexの独立再レビュー (codex/review-resume-20261111 の 8c8ca5c) の順序試験を移植した。実Hubを呼び、OS入力はfixtureのdry-runで置き換える (#262)。
fn review_resume_key(h: &mut Hub, n: i64, state: &str, epoch: u64) {
    h.accept_input(0, json!({"iseq":n,"epoch":epoch,"button":"act:forward","state":state,"t":1_000_000.0}), Via::Rtc);
}

#[test]
fn review_resume_original_late_look_and_fresh_baseline() {
    let (mut h, _rx) = fixture();
    let epoch = h.game.epoch;
    h.set_output(index("KEY_W"), "P1", true);
    h.accept_look(1, &json!({"epoch":epoch,"lseq":1,"cx":10,"cy":0}));
    h.handle_player_message(1, json!({"type":"release_inputs","epoch":epoch,"iseq":0,"lseq":2,"cx":100,"cy":0}), Via::Ws);
    assert_eq!(h.look.px, 0.0);
    h.accept_look(1, &json!({"epoch":epoch,"lseq":2,"cx":100,"cy":0}));
    assert_eq!(h.look.px, 0.0, "解放前の遅着視点を捨てる");
    h.accept_look(1, &json!({"epoch":epoch,"lseq":3,"cx":105,"cy":2}));
    assert_eq!((h.look.px,h.look.py), (5.0,2.0), "新タッチに捨てた移動を混ぜない");
    h.handle_player_message(1, json!({"type":"release_inputs","epoch":epoch,"iseq":0,"lseq":2,"cx":100,"cy":0}), Via::Ws);
    assert_eq!(h.look.px,5.0,"重複した古い要求で新視点を消さない");
    assert_eq!(h.game.epoch,epoch);
    assert!(h.outputs[index("KEY_W")].physical,"他参加者の保持を維持");
    h.release_outputs(None);
}

#[test]
fn review_resume_original_new_press_overtakes_release() {
    let (mut h, _rx) = fixture();
    h.keybinds=Keybinds::build(h.profile.as_ref().unwrap(),None);
    let epoch=h.game.epoch;
    for (n,s) in [(1,"down"),(2,"up"),(3,"down")] {review_resume_key(&mut h,n,s,epoch);}
    h.handle_player_message(0,json!({"type":"release_inputs","epoch":epoch,"iseq":2,"lseq":0,"cx":0,"cy":0}),Via::Ws);
    assert!(h.slots[0].as_ref().unwrap().pressed.contains("act:forward"));
    assert!(h.outputs[index("KEY_W")].holders.contains("P1"));
    review_resume_key(&mut h,3,"down",epoch); // WS側の重複も保持を変えない
    assert!(h.slots[0].as_ref().unwrap().pressed.contains("act:forward"));
    h.release_outputs(None);
}

#[test]
fn review_resume_old_press_rejected_and_global_stop_preserved() {
    for stop in 0..3 {
        let (mut h, _rx)=fixture();
        h.keybinds=Keybinds::build(h.profile.as_ref().unwrap(),None);
        let epoch=h.game.epoch;
        h.set_output(index("MOUSE_L"),"P3",true);
        h.handle_player_message(0,json!({"type":"release_inputs","epoch":epoch,"iseq":2,"lseq":0,"cx":0,"cy":0}),Via::Ws);
        review_resume_key(&mut h,1,"down",epoch); review_resume_key(&mut h,2,"up",epoch);
        assert!(!h.outputs[index("KEY_W")].physical,"旧downを復活させない");
        assert!(h.outputs[index("MOUSE_L")].physical,"他者を止めない");
        review_resume_key(&mut h,3,"down",epoch);
        assert!(h.outputs[index("KEY_W")].physical,"新しい押下は許可");
        h.accept_look(1,&json!({"epoch":epoch,"lseq":1,"cx":7,"cy":0}));
        match stop {
            0=>h.set_phase(Phase::Paused,"host pause"),
            1=>h.emergency_stop("review"),
            _=>{h.fake_target=Some(false);h.check_target();}
        }
        assert!(h.outputs.iter().all(|o| !o.physical && o.holders.is_empty() && o.queue.is_empty()),"全体停止は全員解放・キュー破棄");
        assert_eq!(h.look.px,0.0);
        review_resume_key(&mut h,4,"down",epoch);
        assert!(h.outputs.iter().all(|o| !o.physical),"停止前epochの入力を拒否");
    }
}

#[test]
fn review_resume_overtaking_look_discards_old_pending_portion() {
    let (mut h,_rx)=fixture(); let epoch=h.game.epoch;
    h.accept_look(1,&json!({"epoch":epoch,"lseq":1,"cx":10,"cy":0}));
    // 旧視点2(cx=100)は欠落し、新タッチ3(cx=105)がWS解放より先に来る。
    h.accept_look(1,&json!({"epoch":epoch,"lseq":3,"cx":105,"cy":0}));
    h.handle_player_message(1,json!({"type":"release_inputs","epoch":epoch,"iseq":0,"lseq":2,"cx":100,"cy":0}),Via::Ws);
    assert_eq!(h.look.px,5.0,"新タッチ分だけ残し、解放境界以前の補間待ちは捨てる");
}

#[test]
fn review_resume_new_press_does_not_preserve_old_tap_queue() {
    let (mut h,mut rx)=fixture();
    h.keybinds=Keybinds::build(h.profile.as_ref().unwrap(),None);
    let epoch=h.game.epoch; let key=index("KEY_W");
    review_resume_key(&mut h,1,"down",epoch);
    h.outputs[key].changed_at=Some(Instant::now()+Duration::from_secs(60));
    for (n,s) in [(2,"up"),(3,"down"),(4,"up"),(5,"down")] {review_resume_key(&mut h,n,s,epoch);}
    injections(&mut rx);
    h.handle_player_message(0,json!({"type":"release_inputs","epoch":epoch,"iseq":4,"lseq":0,"cx":0,"cy":0}),Via::Ws);
    for _ in 0..8 {finish_wait(&mut h,key);}
    let downs=injections(&mut rx).iter().filter(|e|e["out"]=="KEY_W" && e["state"]=="down").count();
    assert!(downs<=1,"新押下5を残しても、解放済み旧押下3を後から再生しない: {downs}回");
    h.release_outputs(None);
}

#[test]
fn review_resume_legacy_mark_cannot_restore_old_look() {
    let (mut h,_rx)=fixture(); let epoch=h.game.epoch;
    h.accept_look(1,&json!({"epoch":epoch,"lseq":1,"cx":10,"cy":0}));
    h.handle_player_message(1,json!({"type":"release_inputs","epoch":epoch,"iseq":0}),Via::Ws);
    h.accept_look(1,&json!({"epoch":epoch,"lseq":2,"cx":100,"cy":0}));
    assert_eq!(h.look.px,0.0,"視点境界のない旧クライアントも安全側に停止する");
}

#[test]
fn own_release_discards_old_tap_even_when_another_slot_holds_the_same_key() {
    let (mut h, mut rx) = fixture();
    let overrides = crate::key_overrides::GameOverrides::from([
        ("forward".into(), Some("KEY_W".into())),
        ("attack".into(), Some("KEY_W".into())),
    ]);
    h.keybinds = Keybinds::build_with(h.profile.as_ref().unwrap(), None, Some(&overrides));
    h.slots[2] = Some(Slot::new("third".into(), "third-token".into()));
    let epoch = h.game.epoch;
    let key = index("KEY_W");
    review_resume_key(&mut h, 1, "down", epoch);
    h.outputs[key].changed_at = Some(Instant::now() + Duration::from_secs(60));
    for (seq, state) in [(2, "up"), (3, "down"), (4, "up")] {
        review_resume_key(&mut h, seq, state, epoch);
    }
    h.accept_input(2, json!({
        "epoch": epoch, "iseq": 1, "button": "act:attack", "state": "down", "t": 1_000_000.0,
    }), Via::Rtc);
    assert_eq!(h.outputs[key].holders, BTreeSet::from(["P3"]));
    assert!(h.outputs[key].queue.contains(&(true, "P1")));
    injections(&mut rx);
    h.handle_player_message(0, json!({
        "type": "release_inputs", "epoch": epoch, "iseq": 4, "lseq": 0, "cx": 0, "cy": 0,
    }), Via::Ws);
    for _ in 0..8 { finish_wait(&mut h, key); }
    let events = injections(&mut rx);
    assert!(events.iter().all(|e| e["out"] != "KEY_W"),
        "P1の旧連打を捨て、P3が保持する同じキーを途切れさせない: {events:?}");
    assert!(h.outputs[key].physical);
    assert_eq!(h.outputs[key].holders, BTreeSet::from(["P3"]));
    assert_eq!(h.game.epoch, epoch);
    h.release_outputs(None);
}
