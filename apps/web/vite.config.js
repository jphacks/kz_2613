import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const webStatic = fileURLToPath(new URL('../web-static/', import.meta.url));

// 画面の定義は index.html・app.html だけに置く。React版の入口はビルドのたびに作る (#235)。
const PAGES = [['index.html', '/scripts/controller.js', 'phone-react.html', '/react/phone.js'], ['app.html', '/scripts/desktop.js', 'app-react.html', '/react/pc.js']];
function reactPages() {
  return {
    name: 'recooplay-react-pages',
    closeBundle() {
      for (const [source, from, target, to] of PAGES) {
        const html = fs.readFileSync(`${webStatic}${source}`, 'utf8');
        const script = `<script type="module" src="${from}"></script>`;
        if (!html.includes(script)) throw new Error(`${source} に ${from} の読み込みがありません`);
        fs.writeFileSync(`${webStatic}${target}`, html.replace(script, `<script type="module" src="${to}"></script>`));
      }
    },
  };
}

// ビルド結果はホストの静的配信の中へ出す。外部CDNは使わない (オフラインのLANで動かす)。
export default defineConfig({
  plugins: [react(), reactPages()],
  build: {
    outDir: `${webStatic}react/`,
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: { phone: fileURLToPath(new URL('src/phone/main.jsx', import.meta.url)), pc: fileURLToPath(new URL('src/pc/main.jsx', import.meta.url)) },
      output: { entryFileNames: '[name].js', chunkFileNames: '[name].js', assetFileNames: '[name][extname]' },
    },
  },
});
