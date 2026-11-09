import {useLayoutEffect} from 'react';
import {startPseudoGame} from './runtime.ts';
// Reactは静的な殻を所有し、canvasと高頻度の入力照合は描画から独立させる。
export function PseudoGame(){
  useLayoutEffect(()=>startPseudoGame(),[]);
  return <>

<div className="stage">
  <div className="topbar">
    <span className="pill" id="phase">-</span>
    <span className="pill" id="inj">-</span>
    <span className="pill" id="focus">-</span>
    <span className="pill" id="lock">-</span>
  </div>
  <canvas id="cv"></canvas>
  <div id="lockHint">画面をクリックするとマウスがゲームに固定されます（Minecraft と同じ状態）</div>
  <div className="hotbar" id="hotbar"></div>
</div>

<aside>
  <div>
    <h2>プレイヤー</h2>
    <div className="players" id="players"></div>
  </div>

  <div>
    <h2>PC が受け取ったキーボード入力 <span style={{"fontWeight":"400"}}>（色 = 誰の操作か）</span></h2>
    <div className="kb-split">
      <div className="kb" id="kb"></div>
      <div className="kb">
        <div className="row"><div className="k w15" data-code="Enter">Enter<span className="tag"></span></div></div>
        <div className="arrows" id="arrows"></div>
      </div>
    </div>
  </div>

  <div>
    <h2>PC が受け取ったマウス入力</h2>
    <div className="mouse-wrap">
      <div className="mouse">
        <div className="btn lb" id="mL">L</div><div className="btn rb" id="mR">R</div><div className="wh" id="mW"></div>
      </div>
      <canvas id="moveBox" width="240" height="240"></canvas>
      <div className="mstats">
        注入 dx/dy<br/><b id="lookInj">0 / 0</b><br/>
        受信 dx/dy<br/><b id="lookRecv">0 / 0</b><br/>
        比率 <b id="lookRatio">-</b>
      </div>
    </div>
  </div>

  <div>
    <h2>照合（スマホ → PC注入 → この画面で受信）
      <span className="seg" id="modeSeg"><button data-mode="off">OFF</button><button data-mode="test">テスト</button><button data-mode="on">常時ON</button></span>
      <button id="resetStats">リセット</button>
    </h2>
    <div className="stats">
      <div>注入<b id="sInj">0</b></div>
      <div>受信OK<b id="sOk">0</b></div>
      <div>未反映<b id="sMiss">0</b></div>
      <div>遅延 平均<b id="sAvg">-</b></div>
      <div>遅延 最大<b id="sMax">-</b></div>
      <div>押下時間 最短<b id="sHold">-</b></div>
    </div>
  </div>

  <div style={{"flex":"1","display":"flex","flexDirection":"column","minHeight":"0"}}>
    <h2>入力ログ</h2>
    <div id="log" style={{"flex":"1"}}></div>
  </div>
</aside>


  </>;
}
