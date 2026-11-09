import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

// HTMLもViteの入力にし、手動コピーや別配信ルートを持たない。
export default defineConfig({
  root: 'src',
  publicDir: '../public',
  plugins: [react()],
  build: {
    outDir: '../dist', emptyOutDir: true, target: 'es2022',
    rollupOptions: {input: Object.fromEntries(
      ['phone','pc','overlay','diagnostics','pseudo-game'].map(page=>[page,`src/${page}/index.html`])
    )},
  },
});
