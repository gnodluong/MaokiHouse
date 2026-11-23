// Starts the renderer dev server, then Electron pointed at it.
import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import { createRequire } from 'node:module';

const electron = createRequire(import.meta.url)('electron');
const server = await createServer({ configFile: new URL('../desktop/vite.config.ts', import.meta.url).pathname });
await server.listen();
const url = server.resolvedUrls?.local[0] || 'http://localhost:5199/';
const child = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, MAOKI_DEV_URL: url } });
child.on('exit', async code => { await server.close(); process.exit(code ?? 0); });
