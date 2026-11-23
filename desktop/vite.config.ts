import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./renderer', import.meta.url));
// Relative base so the bundle works from file:// inside the packaged app.
export default defineConfig({
  root, base: './', plugins: [react(), {
    name: 'maoki-csp', apply: 'build',
    transformIndexHtml: html => html.replace('<!--csp-->', `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' https:" />`),
  }],
  server: { port: 5199, strictPort: true, fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] } },
  build: { outDir: fileURLToPath(new URL('./dist', import.meta.url)), emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
