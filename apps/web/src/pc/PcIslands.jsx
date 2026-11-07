import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

const CHARACTERS = ['blue', 'green', 'purple', 'red'];

// 参加者の表示。内容は app-view.js の playerCards が計算する
function PlayerCard({ card }) {
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

export function PcIslands({ players }) {
  const cards = useSyncExternalStore(players.subscribe, players.get);
  return createPortal(cards.map((card) => <PlayerCard key={card.slot} card={card} />), document.getElementById('players'));
}
