import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const webStatic = fileURLToPath(new URL('../web-static/', import.meta.url));

// 画面の定義は index.html だけに置く。React版の入口はビルドのたびに index.html から作る (#235)。
function phonePage() {
  return {
    name: 'recooplay-phone-page',
    closeBundle() {
      const html = fs.readFileSync(`${webStatic}index.html`, 'utf8');
      const script = '<script type="module" src="/scripts/controller.js"></script>';
      if (!html.includes(script)) throw new Error('index.html に controller.js の読み込みがありません');
      fs.writeFileSync(`${webStatic}phone-react.html`, html.replace(script, '<script type="module" src="/react/phone.js"></script>'));
    },
  };
}

// ビルド結果はホストの静的配信の中へ出す。外部CDNは使わない (オフラインのLANで動かす)。
export default defineConfig({
  plugins: [react(), phonePage()],
  build: {
    outDir: `${webStatic}react/`,
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: { phone: fileURLToPath(new URL('src/phone/main.jsx', import.meta.url)) },
      output: { entryFileNames: '[name].js', chunkFileNames: '[name].js', assetFileNames: '[name][extname]' },
    },
  },
});
