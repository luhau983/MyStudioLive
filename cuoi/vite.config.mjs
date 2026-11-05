// Build the Cưới Liền Tay React client into cuoi/dist (served by cuoi/server.mjs). Run from the repo root: npm run build:cuoi
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), tailwindcss()],
  // the scene was written against three r170; the rest of the app stays on its own three version
  resolve: { alias: { three: 'three-cuoi' } },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
});
