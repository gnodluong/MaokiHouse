import assert from 'node:assert/strict';
import { handleWorker } from '../api/_lib/worker';
import type { MailFetcher } from '../api/_lib/worker';
import { sendWhatsApp } from '../api/_lib/messaging';
import type { Mailer, SendContext } from '../api/_lib/messaging';

let checks = 0; const ok = (condition: unknown, message: string) => { assert.ok(condition, message); checks++; console.log('PASS', message); };
const j = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const SECRET = 'worker-secret-0123456789abcdef'; const ENV = { WORKER_SECRET: SECRET, SUPABASE_SERVICE_ROLE_KEY: 'service-key', SUPABASE_URL: 'https://p.supabase.co' } as NodeJS.ProcessEnv;

interface World { rpc: { name: string; args: Record<string, unknown> }[]; jobs: object[]; emailAccounts: object[]; candidates: object[]; tick: number; calls: string[]; zalo: { error: number }[]; failTick: boolean }
const fresh = (): World => ({ rpc: [], jobs: [], emailAccounts: [], candidates: [], tick: 0, calls: [], zalo: [], failTick: false });
const fakeFetch = (world: World): typeof fetch => (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const rpc = url.match(/\/rest\/v1\/rpc\/(\w+)/);
  if (rpc) {
    const args = JSON.parse(String(init?.body || '{}')); world.rpc.push({ name: rpc[1], args });
    if ((init?.headers as Headers | Record<string, string>) && !JSON.stringify([...new Headers(init?.headers as HeadersInit).entries()]).includes('service-key')) return j({ message: 'no service key' }, 401);
    switch (rpc[1]) {
      case 'maoki_worker_tick': return world.failTick ? j({ message: 'boom', code: 'XX000' }, 500) : j({ queued: world.tick });
      case 'maoki_worker_claim': { const jobs = world.jobs; world.jobs = []; return j(jobs); }
      case 'maoki_worker_email_accounts': return j(world.emailAccounts);
      case 'maoki_worker_review_candidates': return j(world.candidates);
      default: return new Response(null, { status: 204 });
    }
  }
  world.calls.push(`${init?.method || 'GET'} ${url}`);
  if (url.startsWith('https://openapi.zalo.me/')) return j(world.zalo.shift() || { error: 0 });
  if (url.startsWith('https://oauth2.googleapis.com/token')) return j({ access_token: 'GACCESS' });
  if (url.startsWith('https://mybusiness.googleapis.com/')) { world.calls.push('body:' + String(init?.body)); return j({ comment: 'x' }); }
  if (url.startsWith('https://graph.facebook.com/')) { world.calls.push('graph:' + String(init?.body)); return j({ ok: true }); }
  throw new Error('unexpected ' + url);
}) as typeof fetch;
const mails: Parameters<Mailer>[1][] = []; const mailer: Mailer = async (_c, message) => { mails.push(message); return '<id>'; };
const run = (world: World, opts: { auth?: string; env?: NodeJS.ProcessEnv; mailFetcher?: MailFetcher; method?: string } = {}) => handleWorker(new Request('http://x/api/worker', { method: opts.method || 'POST', headers: { authorization: opts.auth ?? `Bearer ${SECRET}` } }), opts.env || ENV, { transport: fakeFetch(world), mailer, bridge: (async () => new Response(null, { status: 200 })) as typeof fetch, mailFetcher: opts.mailFetcher });

// access control
let world = fresh();
ok((await run(world, { auth: '' })).status === 401 && (await run(world, { auth: 'Bearer wrong-secret-0123456789abcdef' })).status === 401, 'the worker rejects a missing or wrong secret');
ok((await run(world, { env: { ...ENV, WORKER_SECRET: 'short' } })).status === 503 && (await run(world, { env: { ...ENV, SUPABASE_SERVICE_ROLE_KEY: '' } })).status === 503, 'the worker refuses to run without a strong secret and the service key');
ok((await run(world, { method: 'DELETE' })).status === 405 && world.rpc.length === 0, 'only GET and POST are allowed and nothing runs before authentication');

// queue delivery
world = fresh(); world.tick = 2;
world.jobs = [
  { id: 'j1', workspaceId: 'w1', platform: 'zalo', externalId: 'zu1', conversationId: 'c1', text: 'Xin chào!', config: { accessToken: 'at', refreshToken: 'rt', appId: '1', appSecret: 's' }, meta: {} },
  { id: 'j2', workspaceId: 'w1', platform: 'email', externalId: 'g@x.test', conversationId: null, text: 'Hẹn gặp bạn', config: { provider: 'smtp', fromAddress: 'hi@maoki.test', smtpHost: 'smtp.test' }, meta: { subject: 'Booking' } },
  { id: 'j3', workspaceId: 'w1', platform: 'facebook', externalId: 'ps1', conversationId: 'c3', text: 'Hi', config: { pageAccessToken: 'EAA' }, meta: {} },
  { id: 'j4', workspaceId: 'w1', platform: 'whatsapp', externalId: '8490', conversationId: 'c4', text: 'Hi', config: {}, meta: {} },
];
let body = await (await run(world)).json();
ok(body.journeysQueued === 2 && body.sent === 3 && body.failed === 1, 'the worker ticks journeys and delivers queued jobs on every channel');
ok(world.calls.some(call => call.startsWith('POST https://openapi.zalo.me/')) && mails[0]?.to === 'g@x.test' && mails[0].subject === 'Re: Booking' && world.calls.some(call => call.startsWith('graph:')), 'each job is sent through its own channel API');
const done = world.rpc.filter(entry => entry.name === 'maoki_worker_done').map(entry => entry.args as { job: string; ok: boolean; err: string });
ok(done.filter(entry => entry.ok).map(entry => entry.job).join() === 'j1,j2,j3' && done.find(entry => entry.job === 'j4')?.ok === false && /chưa được bật/.test(done.find(entry => entry.job === 'j4')!.err), 'successes are acknowledged and a job without a configured channel is failed with a reason');
ok(world.rpc.every(entry => entry.name.startsWith('maoki_worker_') || entry.name === 'maoki_channel_inbound'), 'the worker only calls its own database interface');

// zalo token refresh is persisted per workspace
world = fresh(); world.zalo = [{ error: -216 }];
world.jobs = [{ id: 'z1', workspaceId: 'w9', platform: 'zalo', externalId: 'zu', conversationId: 'c', text: 'Hi', config: { accessToken: 'old', refreshToken: 'rt', appId: '1', appSecret: 's' }, meta: {} }];
const refreshFetch = fakeFetch(world); const wrapped = (async (input: RequestInfo | URL, init?: RequestInit) => String(input).startsWith('https://oauth.zaloapp.com/') ? j({ access_token: 'new', refresh_token: 'new-rt', expires_in: '3600' }) : refreshFetch(input, init)) as typeof fetch;
await handleWorker(new Request('http://x/api/worker', { method: 'POST', headers: { authorization: `Bearer ${SECRET}` } }), ENV, { transport: wrapped, mailer, bridge: wrapped });
ok(world.rpc.some(entry => entry.name === 'maoki_worker_tokens' && (entry.args as { w: string }).w === 'w9' && JSON.stringify(entry.args).includes('new-rt')), 'a refreshed zalo token pair is stored for the right workspace');

// IMAP
world = fresh(); world.emailAccounts = [{ workspaceId: 'w1', token: 'a'.repeat(64), config: { imapHost: 'imap.test' } }, { workspaceId: 'w2', token: 'b'.repeat(64), config: { imapHost: 'broken.test' } }];
const fetcher: MailFetcher = async config => { if (config.imapHost === 'broken.test') throw new Error('Đăng nhập IMAP thất bại'); return [{ from: 'guest@example.com', name: 'Guest', subject: 'Hello', text: 'Is the room free?', messageId: '<m1>' }, { from: 'two@example.com', name: '', subject: '', text: 'Second', messageId: '<m2>' }]; };
body = await (await run(world, { mailFetcher: fetcher })).json();
const inboundCalls = world.rpc.filter(entry => entry.name === 'maoki_channel_inbound');
ok(body.mailFetched === 2 && inboundCalls.length === 2 && (inboundCalls[0].args as { token: string }).token === 'a'.repeat(64) && JSON.stringify(inboundCalls[0].args).includes('Is the room free?'), 'unseen mail is imported through the inbound function');
ok(body.mailErrors.length === 1 && /IMAP/.test(body.mailErrors[0]) && body.ok === true, 'one broken mailbox does not stop the others');
world = fresh(); world.failTick = true; body = await (await run(world)).json(); ok(body.ok === false && body.errors.some((entry: string) => entry.startsWith('journeys')) && world.rpc.some(entry => entry.name === 'maoki_worker_claim'), 'a failing step is reported but the rest of the run continues');

// review auto-replies
world = fresh(); world.candidates = [{ recordId: 'r1', reviewName: 'accounts/123/locations/456/reviews/R5', text: 'Cảm ơn Hoa!', config: { clientId: 'c', clientSecret: 's', refreshToken: 'rt', accountId: '123', locationId: '456' } }, { recordId: 'r2', reviewName: 'accounts/999/locations/1/reviews/R7', text: 'x', config: { refreshToken: 'rt', accountId: '123', locationId: '456' } }];
body = await (await run(world)).json();
ok(body.reviewsReplied === 1 && world.calls.some(call => call.startsWith('PUT https://mybusiness.googleapis.com/v4/accounts/123/locations/456/reviews/R5/reply')) && world.rpc.some(entry => entry.name === 'maoki_worker_review_replied' && (entry.args as { rec: string }).rec === 'r1') && !world.rpc.some(entry => entry.name === 'maoki_worker_review_replied' && (entry.args as { rec: string }).rec === 'r2'), 'auto-replies go only to reviews of the configured location');

// whatsapp template fallback
const waCalls: string[] = [];
const waFetch = (async (_input: RequestInfo | URL, init?: RequestInit) => { const body = JSON.parse(String(init?.body)); waCalls.push(body.type); return body.type === 'text' ? j({ error: { code: 131047, message: 'Re-engagement message' } }, 400) : j({ ok: true }); }) as typeof fetch;
const waContext: SendContext = { thread: true, configured: true, platform: 'whatsapp', externalId: '8490', config: { phoneNumberId: '1055', accessToken: 'T', templateName: 'followup', templateLang: 'vi' } };
await sendWhatsApp(waContext, 'Nhắc lịch nhận phòng', waFetch); ok(waCalls.join() === 'text,template', 'outside the 24-hour window whatsapp falls back to the approved template');
waCalls.length = 0; await assert.rejects(() => sendWhatsApp({ ...waContext, config: { phoneNumberId: '1055', accessToken: 'T' } }, 'x', waFetch), /24 giờ/); checks++; console.log('PASS without a template the 24-hour window error is reported');
console.log(`${checks} worker checks passed`);
