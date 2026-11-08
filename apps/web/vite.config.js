import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const webStatic = fileURLToPath(new URL('../web-static/', import.meta.url));

// CSS・素材のhead参照は従来版と共通化し、製品画面のbodyはTSXだけが描く (#235)。
const PAGES = [['index.html', '/scripts/controller.js', 'phone-react.html', '/react/phone.js'], ['app.html', '/scripts/desktop.js', 'app-react.html', '/react/pc.js']];
function reactPages() {
  return {
    name: 'recooplay-react-pages',
    closeBundle() {
      for (const [source, from, target, to] of PAGES) {
        const html = fs.readFileSync(`${webStatic}${source}`, 'utf8');
        const script = `<script type="module" src="${from}"></script>`;
        if (!html.includes(script)) throw new Error(`${source} に ${from} の読み込みがありません`);
        const body = html.replace(/<body[^>]*>[\s\S]*<\/body>/, `<body><div id="root" style="display:contents"></div>${script}</body>`);
        fs.writeFileSync(`${webStatic}${target}`, body.replace(script, `<script type="module" src="${to}"></script>`));
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
      input: { phone: fileURLToPath(new URL('src/phone/main.tsx', import.meta.url)), pc: fileURLToPath(new URL('src/pc/main.tsx', import.meta.url)) },
      output: { entryFileNames: '[name].js', chunkFileNames: '[name].js', assetFileNames: '[name][extname]' },
    },
  },
});
