import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./renderer', import.meta.url));
// Relative base so the bundle also works from the WebView's local origin.
export default defineConfig({
  root, base: './', plugins: [react()],
  server: { port: 5198, strictPort: true, fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] } },
  build: { outDir: fileURLToPath(new URL('./dist', import.meta.url)), emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
