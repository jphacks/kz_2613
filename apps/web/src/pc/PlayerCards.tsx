import type { PlayerCardModel, RoleColumnModel } from '../shared/contracts';

const CHARACTERS = ['blue', 'green', 'purple', 'red'];

// 参加者の表示。内容は shared/model/presentation.ts の playerCards が計算する
export function PlayerCard({ card }: { card: PlayerCardModel }) {
  return (
    <article className={card.className} data-slot={card.slot}>
      <div className="player-badge">{card.badge}</div>
      <div className="player-info"><p>{card.name}</p><p>{card.role}</p><p className="player-device">{card.device}</p></div>
      <svg className="player-arrow" viewBox="0 0 36 30" aria-hidden="true"><path d="M2 2H34L18 27Z" /></svg>
      <div className="character">
        <div className={`character-art art-${card.index}`} aria-hidden="true"><img src={`/assets/characters/${CHARACTERS[card.index]}.png`} alt="" /></div>
      </div>
    </article>
  );
}

// 分担の表示。入れ替えのクリックとキー操作は desktop.js が document で受ける
export function RoleColumn({ c }: { c: RoleColumnModel }) {
  const swap = c.swap ? { 'data-swap': c.slot, role: 'button', tabIndex: 0, 'aria-pressed': c.picked, 'aria-label': `プレイヤー${c.index + 1}の担当を入れ替える` } : {};
  return (
    <article className={`role-column${c.picked ? ' picked' : ''}`} {...swap}>
      <h3>プレイヤー{c.index + 1}</h3>
      <div className={`character-art art-${c.index}`} aria-hidden="true"><img src={`/assets/characters/${CHARACTERS[c.index]}.png`} alt="" /></div>
      <div className="role-copy"><b>{c.title}</b><p>{c.line}</p>{c.ack ? <span className="ack-wait">スマホで確認待ち</span> : null}</div>
    </article>
  );
}
