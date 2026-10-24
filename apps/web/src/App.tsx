export function App() {
  const isDesktop = new URLSearchParams(window.location.search).get('view') === 'desktop';
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-8 py-12">
      <div className="mx-auto max-w-3xl space-y-6">
        <p className="text-sm uppercase tracking-widest text-cyan-300">Re:Cooplay</p>
        <h1 className="text-3xl font-bold">{isDesktop ? 'PCホスト画面（初期ひな形）' : 'スマホ操作画面（初期ひな形）'}</h1>
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-6 space-y-3">
          <p>これはCodex / Claude Code向けの初期環境です。</p>
          <p className="text-amber-300">Minecraftへの操作、セッション接続、役割割当は未実装です。</p>
          <p className="text-sm text-slate-400">要件: docs/requirements/requirements-v0.2.md / 技術ゲート: docs/architecture/validation-gates.md</p>
          <a className="text-cyan-300 underline" href={isDesktop ? '/' : '/?view=desktop'}>
            {isDesktop ? 'スマホ表示の確認' : 'PC表示の確認'}
          </a>
        </div>
      </div>
    </main>
  );
}
