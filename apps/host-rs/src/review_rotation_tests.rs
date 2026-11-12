// 独立レビュー: 実Hub、OS入力なし。時計は仮想時刻で検証する。
#[test]
fn review_rotation_focus_freezes_and_resumes_without_old_deadline() {
 let (mut h,mut rx)=fixture(); h.participants=vec![0,1,2]; h.rotation_secs=60;
 let start=now_ms(); h.rotation_at=start+20_000; h.rotation_soon=true;
 h.set_output(index("KEY_W"),"P1",true); h.look.px=90.0;
 h.fake_target=Some(false); h.check_target();
 let left=h.rotation_left; assert!((19_000..=20_000).contains(&left));
 assert_eq!(h.rotation_at,0); assert!(!h.rotation_soon);
 assert!(h.outputs.iter().all(|o|!o.physical&&o.queue.is_empty())); assert_eq!(h.look.px,0.0);
 for t in [start+60_000,start+600_000] {h.rotate_roles_if_due(t);}
 assert_eq!(h.rotation_count,0);
 // OSの前面復帰と同じ状態を作り、10分後の時計で再開させる。
 h.fake_target=Some(true); h.target_ok=true;
 let resumed=start+600_000; h.rotate_roles_if_due(resumed);
 assert_eq!(h.rotation_at,resumed+left); assert_eq!(h.rotation_count,0);
 h.rotate_roles_if_due(resumed+left-1); assert_eq!(h.rotation_count,0);
 injections(&mut rx); h.rotate_roles_if_due(resumed+left);
 assert_eq!(h.rotation_count,1); assert_eq!(h.rotation_at,resumed+left+60_000);
 assert!(injections(&mut rx).iter().all(|e|e["state"]!="down"));
}
#[test]
fn review_rotation_slot_order_and_stale_input_on_each_turn() {
 let (mut h,_rx)=fixture(); h.participants=vec![2,0,1]; h.rotation_secs=60; h.rotation_at=10_000;
 h.slots[2]=Some(Slot::new("third".into(),"third-token".into()));
 h.assigned=h.proposal_for(&h.profile.clone().unwrap(),&[0,1,2]); let first=h.assigned.clone(); h.keybinds=Keybinds::build(h.profile.as_ref().unwrap(),None);
 for turn in 1..=3 {
  let old=h.game.epoch;
  h.set_output(index("KEY_W"),"P1",true); h.set_output(index("MOUSE_L"),"P3",true); h.look.px=19.0;
  let at=h.rotation_at; h.rotate_roles_if_due(at);
  assert_eq!(h.game.epoch,old+1); assert!(h.game.phase==Phase::Coop);
  assert!(h.outputs.iter().all(|o|!o.physical&&o.holders.is_empty()&&o.queue.is_empty())); assert_eq!(h.look.px,0.0);
  for slot in 0..3 {assert_eq!(h.assigned[slot],first[(slot+3-turn%3)%3],"P1→P2→P3、参加配列順ではない");}
  h.accept_input(0,json!({"epoch":old,"iseq":turn,"button":"act:forward","state":"down","t":1_000_000.0}),Via::Rtc);
  h.accept_look(1,&json!({"epoch":old,"lseq":turn,"cx":100,"cy":0}));
  assert!(h.outputs.iter().all(|o|!o.physical)); assert_eq!(h.look.px,0.0);
 }
 assert_eq!(h.assigned,first);
}
#[test]
fn review_rotation_pause_disconnect_emergency_do_not_consume_remainder() {
 for stop in 0..3 {
  let (mut h,_rx)=fixture(); h.participants=vec![0,1]; h.rotation_secs=60; h.rotation_at=now_ms()+20_000;
  h.slots[1].as_mut().unwrap().connected=true;
  match stop {0=>h.set_phase(Phase::Paused,"host pause"),1=>h.mark_disconnected(1,"disconnect"),_=>h.emergency_stop("review")}
  assert!(h.game.phase==Phase::Paused); assert_eq!(h.rotation_at,0); let left=h.rotation_left;
  assert!((19_000..=20_000).contains(&left)); h.rotate_roles_if_due(now_ms()+600_000);
  assert_eq!(h.rotation_left,left); assert_eq!(h.rotation_count,0);
  h.fake_target=Some(false); h.target_ok=false; h.set_phase(Phase::Coop,"review resume");
  assert_eq!(h.rotation_at,0); assert_eq!(h.rotation_left,left);
 }
}

#[test]
fn review_launcher_emergency_gate_original_repro() {
 let (mut h,_rx)=fixture(); h.game.title="minecraft-java".into();h.game.phase=Phase::Lobby;
 h.fake_target=None;h.target_ok=false;h.hotkey=Err("独立試験: 未登録".into());h.on_launcher_focus(true);
 assert!(!h.remote_desktop_active());h.handle_control(0,"ENTER","down");
 assert!(!h.outputs[index("ENTER")].physical,"緊急停止を使えない間はランチャーへ押下を送らない");
 h.hotkey=Ok(());assert!(h.remote_desktop_active());h.handle_control(0,"ENTER","down");
 assert!(h.outputs[index("ENTER")].physical);h.release_outputs(None);
}
#[test]
fn review_launcher_app_transition_rejects_old_input_and_participant() {
 let (mut h,_rx)=fixture();h.desktop=true;h.game.phase=Phase::Lobby;h.fake_target=Some(false);h.check_target();h.on_launcher_focus(true);
 let old=h.game.epoch;
 h.accept_input(0,json!({"epoch":old,"iseq":1,"button":"ENTER","state":"down","t":1_000_000.0}),Via::Rtc);
 assert!(h.outputs[index("ENTER")].physical);
 h.on_app_focus(true);assert!(h.game.epoch>old);assert!(!h.outputs[index("ENTER")].physical);
 h.on_app_focus(false);let epoch=h.game.epoch;assert!(h.remote_desktop_active());
 h.accept_input(0,json!({"epoch":old,"iseq":2,"button":"ENTER","state":"down","t":1_000_000.0}),Via::Rtc);
 h.accept_input(1,json!({"epoch":epoch,"iseq":1,"button":"ENTER","state":"down","t":1_000_000.0}),Via::Rtc);
 assert!(h.outputs.iter().all(|o|!o.physical),"旧経路の入力と参加者のランチャー操作を拒否");
 h.game.phase=Phase::Coop;h.app_focused=false;h.command(0,"OPEN_APP");assert!(!h.app_focused,"協力中の前面化を拒否");
}
