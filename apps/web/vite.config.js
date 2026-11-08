import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const webStatic = fileURLToPath(new URL('../web-static/', import.meta.url));

// 製品HTMLを正本にする。比較用の旧HTML/JSをビルド入力へ混ぜない。
const PAGES = [['phone.html','phone-react.html','phone'],['pc.html','app-react.html','pc']];
function reactPages() {
  return {
    name: 'recooplay-react-pages',
    closeBundle() {
      for (const [source,target,entry] of PAGES) {
        const html = fs.readFileSync(new URL(`pages/${source}`,import.meta.url),'utf8');
        if(!html.includes('id="root"')||!html.includes(`src="/react/${entry}.js"`))throw new Error(`${source} に製品の起動要素がありません`);
        fs.writeFileSync(`${webStatic}${target}`,html);
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
