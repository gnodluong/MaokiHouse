// Runs under Deno (npm run test:edge): the same code that Supabase deploys, exercised without the network.
import { route } from '../_shared/router.ts';
import { isPublicAddress, publicFetch } from '../_shared/calendars.ts';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

let checks = 0; const ok = (condition: unknown, message: string) => { if (!condition) throw new Error('FAIL ' + message); checks++; console.log('PASS', message); };
const env = { SUPABASE_SERVICE_ROLE_KEY: 'service-test', SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', WORKER_SECRET: 'secret-secret-secret-secret' };
const call = (path: string, init?: RequestInit) => route(new Request('https://x.supabase.co/functions/v1/api/' + path, init), env);

let res = await call('messaging', { method: 'OPTIONS' });
ok(res.status === 204 && res.headers.get('access-control-allow-origin') === '*' && /authorization/.test(res.headers.get('access-control-allow-headers') || ''), 'preflight answers with CORS headers');
res = await call('nothing'); ok(res.status === 404 && res.headers.get('access-control-allow-origin') === '*', 'unknown endpoint is a 404 with CORS');
res = await call('messaging', { method: 'GET' }); ok(res.status === 405, 'messaging is POST only');
res = await call('messaging', { method: 'POST', body: '{}' }); ok(res.status === 401, 'messaging needs a login');
res = await call('worker', { method: 'POST' }); ok(res.status === 401 || res.status === 403, 'worker rejects a call without the secret');
res = await call('worker', { method: 'POST', headers: { authorization: 'Bearer wrong-wrong-wrong-wrong-' } }); ok(res.status === 401 || res.status === 403, 'worker rejects a wrong secret');
res = await call('channels', { method: 'GET' }); ok(res.status === 401, 'channels needs a login');
res = await call('inbound?token=' + 'a'.repeat(64), { method: 'PUT' }); ok(res.status === 405, 'inbound only allows GET and POST');
ok(isPublicAddress('8.8.8.8') && !isPublicAddress('10.0.0.5') && !isPublicAddress('127.0.0.1') && !isPublicAddress('169.254.169.254'), 'private and metadata addresses are refused');
let blocked = false; try { await publicFetch('https://localhost/x.ics'); } catch { blocked = true; } ok(blocked, 'the guarded fetch refuses localhost');
ok(typeof nodemailer.createTransport === 'function' && typeof ImapFlow === 'function' && typeof simpleParser === 'function', 'nodemailer, imapflow and mailparser load under Deno');
console.log(`${checks} edge checks passed`);
