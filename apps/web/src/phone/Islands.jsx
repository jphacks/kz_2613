import { useLayoutEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

// 画面の定義は apps/web-static/index.html だけにある。Reactは変わる部分だけを既存の要素の中へ描く (#235)。
// タッチパッド・キーなどの入力の要素には触れない。controller.js が結び付けたまま動く。
const byId = (id) => document.getElementById(id);

/** 既存の要素の中へ描く。最初に入っている文字はReactの表示に置き換える */
const island = (id, children) => createPortal(children, byId(id));

export function clearIslands() {
  for (const id of ['players1', 'players2', 'waitHeading', 'waitRole', 'waitTitle', 'remoteRoute', 'startBtn', 'openGameBtn', 'hostTransfer', 'remoteNote']) byId(id).textContent = '';
}

const chips = (players) => players.map((p) => <span key={p.name} className={p.on ? 'on' : ''}>{p.label}</span>);

export function Islands({ waitStore, remoteStore }) {
  const wait = useSyncExternalStore(waitStore.subscribe, waitStore.get);
  const remote = useSyncExternalStore(remoteStore.subscribe, remoteStore.get);
  // 属性は要素を作り直さずに変える。controller.js のクリックの結び付けを保つ
  useLayoutEffect(() => {
    byId('waitCharacter').src = wait.character;
    byId('startBtn').disabled = remote.startDisabled;
    byId('openGameBtn').hidden = remote.openGameHidden;
    byId('endBtn').style.display = remote.endVisible ? 'block' : 'none';
    byId('hostTransfer').hidden = !remote.transferTo.length;
  }, [wait.character, remote.startDisabled, remote.openGameHidden, remote.endVisible, remote.transferTo.length]);
  return (
    <>
      {island('players2', chips(wait.players))}
      {island('waitHeading', wait.heading)}
      {island('waitRole', wait.role)}
      {island('waitTitle', wait.title)}
      {island('players1', chips(remote.players))}
      {island('remoteRoute', remote.route)}
      {island('startBtn', remote.startLabel)}
      {island('openGameBtn', remote.openGameLabel)}
      {island('hostTransfer', <>
        {remote.transferTo.length ? 'ホストを譲る：' : null}
        {remote.transferTo.map((p) => <button key={p} className="key" onClick={() => remoteStore.transfer?.(p)}>{p}</button>)}
      </>)}
      {island('remoteNote', remote.note)}
    </>
  );
}
