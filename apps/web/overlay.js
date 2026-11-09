// 観客向け表示 (#163)。状態を受け取って描くだけで、ホストへ操作を送らない。
import { overlayModel } from './src/shared/model/presentation.ts';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
if (new URLSearchParams(location.search).get('position') === 'top') document.body.dataset.position = 'top';

function draw(state) {
  const view = overlayModel(state);
  $('status').textContent = view.status;
  $('overlay').innerHTML = view.players.map((p) => `<article class="card${p.connected ? '' : ' off'}" data-slot="${esc(p.slot)}">
    <div class="name">プレイヤー${esc(p.slot.slice(1))}</div><div class="role">${esc(p.role)}</div>
    <div class="keys">${p.pressed.map((k) => `<span>${esc(k)}</span>`).join('')}</div></article>`).join('');
}

function connect() {
  const ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onopen = () => ws.send(JSON.stringify({ type: 'monitor', page: 'overlay' }));
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.type === 'state') draw(m); };
  ws.onclose = () => { draw(null); setTimeout(connect, 1000); };
}
connect();
