import assert from 'node:assert/strict';
import { handleInbound, handleMessaging, normaliseEmail, stripQuotedReply } from '../api/_lib/messaging';
import type { Mailer } from '../api/_lib/messaging';

let checks = 0; const ok = (condition: unknown, message: string) => { assert.ok(condition, message); checks++; console.log('PASS', message); };
const CONV = '11111111-1111-4111-8111-111111111111'; const TOKEN = 'a'.repeat(64);
const j = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

interface World { context: Record<string, unknown>; zalo: { error: number; message?: string }[]; calls: string[]; tokens: unknown[]; rpcError?: { code: string; message: string }; user: boolean }
function fakeFetch(world: World): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); world.calls.push(url);
    if (url.includes('/auth/v1/user')) return world.user ? j({ id: 'u1', aud: 'authenticated', email: 'o@x.test', app_metadata: {}, user_metadata: {}, created_at: '2024-01-01' }) : j({ msg: 'bad' }, 401);
    if (url.includes('/rest/v1/rpc/maoki_channel_accounts')) {
      const body = JSON.parse(String(init?.body)); if (world.rpcError) return j(world.rpcError, 400);
      if (body.op === 'tokens') { world.tokens.push(body.payload); return j({ ok: true }); }
      return j(world.context);
    }
    if (url.includes('/rest/v1/rpc/maoki_channel_inbound')) { const body = JSON.parse(String(init?.body)); world.calls.push('inbound:' + JSON.stringify(body)); return j({ ok: true }); }
    if (url.startsWith('https://openapi.zalo.me/')) return j(world.zalo.shift() || { error: 0 });
    if (url.startsWith('https://oauth.zaloapp.com/')) return j({ access_token: 'new-at', refresh_token: 'new-rt', expires_in: '3600' });
    throw new Error('unexpected request ' + url);
  }) as typeof fetch;
}
const fresh = (): World => ({ context: {}, zalo: [], calls: [], tokens: [], user: true });
const send = (world: World, text = 'Xin chào', mailer?: Mailer, auth = 'Bearer tok') => handleMessaging(new Request('http://x/api/messaging', { method: 'POST', headers: { authorization: auth }, body: JSON.stringify({ conversationId: CONV, text }) }), { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' } as NodeJS.ProcessEnv, fakeFetch(world), mailer);

// Zalo
let world = fresh(); world.context = { thread: true, configured: true, platform: 'zalo', externalId: 'zu1', config: { accessToken: 'at', refreshToken: 'rt', appId: '1', appSecret: 's' } };
let res = await send(world); ok((await res.json()).sent === true && world.calls.some(call => call.startsWith('https://openapi.zalo.me/')), 'zalo reply is delivered through the OA API');
world = fresh(); world.context = { thread: true, configured: true, platform: 'zalo', externalId: 'zu1', config: { accessToken: 'old', refreshToken: 'rt', appId: '1', appSecret: 's' } }; world.zalo = [{ error: -216, message: 'invalid' }, { error: 0 }];
res = await send(world); ok((await res.json()).sent === true && world.tokens.length === 1 && (world.tokens[0] as { refreshToken: string }).refreshToken === 'new-rt', 'expired zalo token is refreshed once and the new pair is stored');
world = fresh(); world.context = { thread: true, configured: true, platform: 'zalo', externalId: 'zu1', config: { accessToken: 'at' } }; world.zalo = [{ error: -233, message: 'outside 48h' }];
let body = await (await send(world)).json(); ok(body.sent === false && /48/.test(body.error), 'zalo 48-hour window error is explained');
// Email
const mails: Parameters<Mailer>[1][] = []; const mailer: Mailer = async (_config, message) => { mails.push(message); return '<id@x>'; };
world = fresh(); world.context = { thread: true, configured: true, platform: 'email', externalId: 'guest@example.com', meta: { subject: 'Booking question', lastMessageId: '<a@b>' }, config: { provider: 'smtp', fromAddress: 'hello@maoki.test', smtpHost: 'smtp.test' } };
body = await (await send(world, 'Yes, breakfast is included.', mailer)).json(); ok(body.sent === true && mails[0].to === 'guest@example.com' && mails[0].subject === 'Re: Booking question' && mails[0].inReplyTo === '<a@b>', 'email reply keeps the subject and threading headers');
world = fresh(); world.context = { thread: true, configured: true, platform: 'email', externalId: 'g@x.test', config: { provider: 'smtp' } };
body = await (await send(world, 'x', mailer)).json(); ok(body.sent === false && /chưa đầy đủ/.test(body.error), 'incomplete email setup is reported, not sent');
world = fresh(); world.context = { thread: true, configured: true, platform: 'email', externalId: 'g@x.test', config: { provider: 'smtp', fromAddress: 'a@b.co', smtpHost: 'h' } };
body = await (await send(world, 'x', async () => { throw new Error('SMTP 535 auth failed'); })).json(); ok(body.sent === false && /535/.test(body.error), 'mail provider errors are surfaced to the host');
// Non-channel conversations and auth
world = fresh(); world.context = { thread: false }; body = await (await send(world)).json(); ok(body.skipped === true, 'web chat conversations are skipped without error');
world = fresh(); world.context = { thread: true, configured: false, platform: 'zalo' }; body = await (await send(world)).json(); ok(body.sent === false && /chưa được bật/.test(body.error), 'disabled channel is reported');
world = fresh(); res = await send(world, 'x', undefined, ''); ok(res.status === 401, 'sending requires a signed-in user');
world = fresh(); world.user = false; res = await send(world); ok(res.status === 401, 'an invalid session token is rejected');
world = fresh(); res = await handleMessaging(new Request('http://x/api/messaging', { method: 'POST', headers: { authorization: 'Bearer t' }, body: JSON.stringify({ conversationId: 'nope', text: 'x' }) }), process.env, fakeFetch(world)); ok(res.status === 400, 'malformed conversation id is rejected');
world = fresh(); world.rpcError = { code: 'PGRST202', message: 'missing' }; res = await send(world); ok(res.status === 503, 'missing database migration gives a clear 503');
res = await handleMessaging(new Request('http://x/api/messaging', { method: 'GET' })); ok(res.status === 405, 'messaging endpoint is POST only');

// Inbound
ok(stripQuotedReply('Thanks!\nSee you.\n\nOn Mon, 3 Mar 2025 at 10:00, Maoki <h@m.co> wrote:\n> old text') === 'Thanks!\nSee you.', 'quoted reply text is stripped');
const pm = normaliseEmail('application/json', JSON.stringify({ From: 'Guest <guest@example.com>', FromName: 'Guest', Subject: 'Hi', TextBody: 'Hello there', MessageID: 'pm-1' })); ok(pm?.from === 'guest@example.com' && pm.messageId === 'pm-1', 'postmark inbound JSON is understood');
const mg = normaliseEmail('application/x-www-form-urlencoded', new URLSearchParams({ sender: 'a@b.co', subject: 'S', 'body-plain': 'Body', 'Message-Id': '<m>' }).toString()); ok(mg?.from === 'a@b.co' && mg.text === 'Body', 'mailgun-style form post is understood');
ok(normaliseEmail('application/json', '{bad') === null && normaliseEmail('application/json', JSON.stringify({ from: 'a@b.co', text: '   ' })) === null, 'unparseable or empty mail is ignored');
const inboundCall = (token: string, raw: string, headers: Record<string, string>, world: World) => handleInbound(new Request(`http://x/api/inbound?token=${token}`, { method: 'POST', headers }), raw, { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' } as NodeJS.ProcessEnv, fakeFetch(world));
world = fresh(); res = await inboundCall(TOKEN, JSON.stringify({ app_id: '1', event_name: 'user_send_text', timestamp: '1' }), { 'x-zevent-signature': 'mac=abc' }, world); ok(res.status === 200 && world.calls.some(call => call.includes('"raw"') && call.includes('"signature":"mac=abc"')), 'zalo webhook forwards the raw body and signature untouched');
world = fresh(); res = await inboundCall(TOKEN, JSON.stringify({ from: 'g@x.test', text: 'hi' }), { 'content-type': 'application/json' }, world); ok(res.status === 200 && world.calls.some(call => call.startsWith('inbound:') && call.includes('g@x.test')), 'email webhook forwards the normalised message');
res = await inboundCall('short', '{}', {}, fresh()); ok(res.status === 404, 'malformed inbound token is rejected before any lookup');
res = await handleInbound(new Request(`http://x/api/inbound?token=${TOKEN}`, { method: 'GET' }), ''); ok(res.status === 405, 'inbound endpoint is POST only');
console.log(`${checks} messaging checks passed`);
