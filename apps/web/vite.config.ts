import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

// HTMLもViteの入力にし、手動コピーや別配信ルートを持たない。
export default defineConfig(({mode}) => ({
  root: 'src',
  publicDir: '../public',
  plugins: [react()],
  // 遅延の計測用ビルド (npm run build:latency) だけ true。通常のビルド・配布物では false になり、計測の処理は取り除かれる
  define: {__LATENCY_MEASURE__: JSON.stringify(mode === 'latency')},
  build: {
    outDir: '../dist', emptyOutDir: true, target: 'es2022',
    rollupOptions: {input: Object.fromEntries(
      ['phone','pc','overlay','diagnostics','pseudo-game'].map(page=>[page,`src/${page}/index.html`])
    )},
  },
}));
