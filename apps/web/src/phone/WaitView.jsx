import { useSyncExternalStore } from 'react';

// 待機画面。内容は phone-model.js の waitModel が計算し、入力には関わらない。
export function WaitView({ store }) {
  const wait = useSyncExternalStore(store.subscribe, store.get);
  return (
    <>
      <div className="players" id="players2">
        {wait.players.map((p) => <span key={p.name} className={p.on ? 'on' : ''}>{p.label}</span>)}
      </div>
      <div className="wait-scene">
        <div className="phone-character" aria-hidden="true"><img id="waitCharacter" src={wait.character} alt="" /></div>
        <div className="card wait-card">
          <h1 className="dotted" id="waitHeading">{wait.heading}</h1>
          <div className="role-label">あなたの担当</div>
          <div id="waitRole">{wait.role}</div>
          <div className="wait-continue" role="note">Readyで操作画面に変わります</div>
          <div id="waitTitle">{wait.title}</div>
        </div>
      </div>
    </>
  );
}
