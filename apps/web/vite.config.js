import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ビルド結果はホストの静的配信の中へ出す。外部CDNは使わない (オフラインのLANで動かす)。
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('../web-static/react/', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: { phone: fileURLToPath(new URL('src/phone/main.jsx', import.meta.url)) },
      output: { entryFileNames: '[name].js', chunkFileNames: '[name].js', assetFileNames: '[name][extname]' },
    },
  },
});
