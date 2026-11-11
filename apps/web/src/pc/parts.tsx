import { Fragment, useState } from 'react';
import { settingsActions, type PcSnapshot, type pcModel } from './model';
type Model = ReturnType<typeof pcModel>;
type Card = Model['gameCards'][number];

export function Lines({text}: {text: string}) {
  return text.split('\n').map((line, i) => <Fragment key={i}>{i > 0 && <br />}{line}</Fragment>);
}
export function GameTile({card}: {card: Card}) {
  const [failed, setFailed] = useState(false);
  return <button className={`game-choice${card.selected ? ' selected' : ''}${card.unverified ? ' unverified' : ''}`} data-game={card.id} aria-pressed={card.selected} aria-label={`${card.name}を選択${card.unverified ? '（未検証）' : ''}`}>
    <span className="tile-art" aria-hidden="true">{card.image && !failed ? <img src={card.image} alt="" loading="lazy" data-initial={card.initial} onError={() => setFailed(true)} /> : <span className="tile-initial">{card.initial}</span>}</span>
    <span className="tile-name">{card.name}</span><span className="game-badges">{card.badges.map((badge: string) => <span key={badge} className={`badge${badge === '未検証' ? ' badge-unverified' : ''}`}>{badge}</span>)}</span>
    {card.launch && <span className="game-launch" data-state={card.launch.state}>{card.launch.title}</span>}
  </button>;
}
export function KeyEditor({model, state}: {model: Model; state: PcSnapshot}) {
  if (!model.keyButtons.length) return null;
  return <><h3>キー割当を変える</h3><p>{model.locked ? '協力プレイ中は変更できません。一時停止すると変更できます。' : '変更はこのPCに保存され、次回も使います。'}{state.keyMessage}</p>
    <table className="key-editor"><tbody>{model.keyButtons.map(action => <tr key={action.id}><th>{action.label}{model.edited.has(action.id) ? '（変更済み）' : ''}</th><td>
      <select data-key-action={action.id} disabled={model.locked} value={state.game?.keys?.actions?.[action.id]?.out ?? ''} onChange={event => settingsActions.setKey(action.id, event.currentTarget.value || null)}>
        <option value="">送らない</option>{model.outputs.map(([id, output]) => <option value={id} key={id}>{output.label}</option>)}
      </select></td></tr>)}</tbody></table><button id="resetKeysBtn" disabled={model.locked || !model.edited.size}>このゲームのキーを初期値に戻す</button></>;
}
export function NetworkDiagnostics({model, bluetooth}: {model: Model; bluetooth: boolean}) {
  if (!model.diagnostics.length) return <p>つながっているスマホはありません。</p>;
  return <>{model.diagnostics.map(d => <section key={d.name} className="net-row" data-level={d.level}>
    <h3>{d.name}：{{ok: '良好', warn: '注意', bad: '不安定'}[d.level as 'ok'|'warn'|'bad']}</h3><p>経路 {d.path}・往復 {d.rtt ?? '-'}ms（95% {d.p95 ?? '-'}ms）・途切れ {d.stalls}回/10秒・再接続 {d.reconnects}回</p>
    {d.lastWarning && <p>最後の途切れ警告：{new Date(d.lastWarning.at).toLocaleTimeString('ja-JP')}、{d.lastWarning.stalls}回/10秒（最大空白 {d.lastWarning.maxStallMs}ms）</p>}
    {d.hints.length > 0 && <ul>{d.hints.map((hint: string) => <li key={hint}>{hint}</li>)}</ul>}
  </section>)}{bluetooth && <p className="net-bt">PCの音の出力先がBluetoothです。有線のイヤホンかPCのスピーカーにすると、通信が安定しやすくなります。</p>}</>;
}
