import assert from 'node:assert/strict';
import { handleInbound, handleMessaging, normaliseEmail, stripQuotedReply } from '../supabase/functions/_shared/messaging';
import type { Mailer } from '../supabase/functions/_shared/messaging';

let checks = 0; const ok = (condition: unknown, message: string) => { assert.ok(condition, message); checks++; console.log('PASS', message); };
const CONV = '11111111-1111-4111-8111-111111111111'; const TOKEN = 'a'.repeat(64);
const j = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

interface World { context: Record<string, unknown>; zalo: { error: number; message?: string }[]; calls: string[]; tokens: unknown[]; meta: object[]; metaStatus: number; rpcError?: { code: string; message: string }; user: boolean }
function fakeFetch(world: World): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); world.calls.push(url);
    if (url.includes('/auth/v1/user')) return world.user ? j({ id: 'u1', aud: 'authenticated', email: 'o@x.test', app_metadata: {}, user_metadata: {}, created_at: '2024-01-01' }) : j({ msg: 'bad' }, 401);
    if (url.includes('/rest/v1/rpc/maoki_channel_accounts')) {
      const body = JSON.parse(String(init?.body)); if (world.rpcError) return j(world.rpcError, 400);
      if (body.op === 'tokens') { world.tokens.push(body.payload); return j({ ok: true }); }
      return j(world.context);
    }
    if (url.includes('/rest/v1/rpc/maoki_channel_verify')) { const body = JSON.parse(String(init?.body)); return j(body.verify === 'good-verify'); }
    if (url.startsWith('https://graph.facebook.com/')) { world.calls.push('graph:' + String(init?.headers && (init.headers as Record<string, string>).Authorization) + ':' + String(init?.body)); return j(world.meta.shift() || { recipient_id: 'x' }, world.metaStatus); }
    if (url.includes('/rest/v1/rpc/maoki_channel_inbound')) { const body = JSON.parse(String(init?.body)); world.calls.push('inbound:' + JSON.stringify(body)); return j({ ok: true }); }
    if (url.startsWith('https://openapi.zalo.me/')) return j(world.zalo.shift() || { error: 0 });
    if (url.startsWith('https://oauth.zaloapp.com/')) return j({ access_token: 'new-at', refresh_token: 'new-rt', expires_in: '3600' });
    throw new Error('unexpected request ' + url);
  }) as typeof fetch;
}
const fresh = (): World => ({ context: {}, zalo: [], calls: [], tokens: [], meta: [], metaStatus: 200, user: true });
const bridgeCalls: { url: string; body: string; auth: string }[] = []; let bridgeStatus = 200;
const bridge = (async (url: string, init?: RequestInit) => { bridgeCalls.push({ url: String(url), body: String(init?.body), auth: String((init?.headers as Record<string, string>).Authorization) }); return new Response(null, { status: bridgeStatus }); }) as typeof fetch;
const send = (world: World, text = 'Xin chào', mailer?: Mailer, auth = 'Bearer tok') => handleMessaging(new Request('http://x/api/messaging', { method: 'POST', headers: { authorization: auth }, body: JSON.stringify({ conversationId: CONV, text }) }), { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' } as NodeJS.ProcessEnv, fakeFetch(world), mailer, bridge);

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
// Facebook / Instagram
world = fresh(); world.context = { thread: true, configured: true, platform: 'facebook', externalId: 'psid-1', config: { pageId: 'P1', pageAccessToken: 'EAA' } };
body = await (await send(world, 'Chào bạn')).json(); ok(body.sent === true && world.calls.some(call => call.startsWith('graph:Bearer EAA:') && call.includes('"id":"psid-1"') && call.includes('RESPONSE')), 'messenger reply goes through the Send API with the page token');
world = fresh(); world.context = { thread: true, configured: true, platform: 'instagram', externalId: 'igsid-1', config: { pageId: 'IG1', pageAccessToken: 'EAA' } }; ok((await (await send(world)).json()).sent === true && world.calls.some(call => call.includes('/IG1/messages')), 'instagram reply uses the linked account id');
world = fresh(); world.context = { thread: true, configured: true, platform: 'facebook', externalId: 'p', config: { pageAccessToken: 'EAA' } }; world.metaStatus = 400; world.meta = [{ error: { message: 'Invalid OAuth access token', code: 190 } }];
body = await (await send(world)).json(); ok(body.sent === false && /hết hạn/.test(body.error), 'expired page token is explained');
world = fresh(); world.context = { thread: true, configured: true, platform: 'facebook', externalId: 'p', config: { pageAccessToken: 'EAA' } }; world.metaStatus = 400; world.meta = [{ error: { message: 'This message is sent outside of allowed window.', code: 10, error_subcode: 2534022 } }];
body = await (await send(world)).json(); ok(body.sent === false && /24 giờ/.test(body.error), 'meta 24-hour window error is explained');
world = fresh(); world.context = { thread: true, configured: true, platform: 'facebook', externalId: 'p', config: {} }; body = await (await send(world)).json(); ok(body.sent === false && /Page access token/.test(body.error), 'missing page token is reported');
// WhatsApp / TikTok
world = fresh(); world.context = { thread: true, configured: true, platform: 'whatsapp', externalId: '84901234567', config: { phoneNumberId: '1055555', accessToken: 'WAT' } };
body = await (await send(world, 'Còn phòng nhé')).json(); ok(body.sent === true && world.calls.some(call => call.includes('graph:Bearer WAT:') && call.includes('"messaging_product":"whatsapp"') && call.includes('"to":"84901234567"')), 'whatsapp reply goes through the Cloud API with the access token');
ok(world.calls.some(call => call.includes('/v21.0/1055555/messages')), 'whatsapp sends from the configured phone number id');
world = fresh(); world.context = { thread: true, configured: true, platform: 'whatsapp', externalId: '8490', config: { phoneNumberId: '1', accessToken: 'WAT' } }; world.metaStatus = 400; world.meta = [{ error: { message: 'Re-engagement message', code: 131047 } }];
body = await (await send(world)).json(); ok(body.sent === false && /template/.test(body.error), 'whatsapp 24-hour window explains the template requirement');
world = fresh(); world.context = { thread: true, configured: true, platform: 'whatsapp', externalId: '8490', config: { phoneNumberId: '1', accessToken: 'WAT' } }; world.metaStatus = 400; world.meta = [{ error: { message: 'expired', code: 190 } }];
body = await (await send(world)).json(); ok(body.sent === false && /hết hạn/.test(body.error), 'expired whatsapp token is explained');
world = fresh(); world.context = { thread: true, configured: true, platform: 'whatsapp', externalId: '8490', config: {} }; body = await (await send(world)).json(); ok(body.sent === false && /Phone number ID/.test(body.error), 'incomplete whatsapp setup is reported');
world = fresh(); world.context = { thread: true, configured: true, platform: 'tiktok', externalId: 'tt-1', config: { outboundUrl: 'https://bridge.example.test/send', outboundToken: 'BT' } };
body = await (await send(world, 'Hi TikTok')).json(); ok(body.sent === true && bridgeCalls.at(-1)?.url === 'https://bridge.example.test/send' && bridgeCalls.at(-1)?.auth === 'Bearer BT' && JSON.parse(bridgeCalls.at(-1)!.body).to === 'tt-1', 'tiktok reply is posted to the configured bridge with its token');
bridgeStatus = 502; body = await (await send(world)).json(); ok(body.sent === false && /502/.test(body.error), 'bridge failures are surfaced'); bridgeStatus = 200;
world = fresh(); world.context = { thread: true, configured: true, platform: 'tiktok', externalId: 'tt-1', config: {} }; body = await (await send(world)).json(); ok(body.sent === false && /cầu nối/.test(body.error), 'missing bridge address is reported');
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
world = fresh(); res = await inboundCall(TOKEN, JSON.stringify({ object: 'page', entry: [] }), { 'x-hub-signature-256': 'sha256=abc' }, world); ok(res.status === 200 && world.calls.some(call => call.includes('"signature":"sha256=abc"')), 'meta webhook forwards the raw body and x-hub-signature-256');
world = fresh(); res = await inboundCall(TOKEN, JSON.stringify({ object: 'instagram', entry: [] }), {}, world); ok(world.calls.some(call => call.includes('"raw"')), 'unsigned meta payloads still go to the verifier, which rejects them');
const handshake = (verify: string, extra = '') => handleInbound(new Request(`http://x/api/inbound?token=${TOKEN}&hub.mode=subscribe&hub.challenge=12345&hub.verify_token=${verify}${extra}`, { method: 'GET' }), '', { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' } as NodeJS.ProcessEnv, fakeFetch(fresh()));
res = await handshake('good-verify'); ok(res.status === 200 && await res.text() === '12345', 'meta handshake echoes the challenge for the right verify token');
res = await handshake('wrong'); ok(res.status === 403, 'meta handshake rejects a wrong verify token');
res = await handleInbound(new Request(`http://x/api/inbound?token=${TOKEN}`, { method: 'GET' }), ''); ok(res.status === 400, 'a bare GET without hub parameters is rejected');
world = fresh(); res = await inboundCall(TOKEN, JSON.stringify({ object: 'whatsapp_business_account', entry: [] }), { 'x-hub-signature-256': 'sha256=zz' }, world); ok(res.status === 200 && world.calls.some(call => call.includes('"signature":"sha256=zz"')), 'whatsapp webhook is routed to the signature verifier');
world = fresh(); res = await inboundCall(TOKEN, JSON.stringify({ from: 'tt-9', name: 'Fan', text: '> quoted-looking text stays', messageId: 'a1', timestamp: '1700000000' }), { 'content-type': 'application/json' }, world); ok(world.calls.some(call => call.startsWith('inbound:') && call.includes('"fullText":"> quoted-looking text stays"') && call.includes('"timestamp":"1700000000000"')), 'bridge messages keep the full text and a millisecond timestamp');
res = await handleInbound(new Request(`http://x/api/inbound?token=${TOKEN}`, { method: 'DELETE' }), ''); ok(res.status === 405, 'inbound endpoint only allows GET and POST');
console.log(`${checks} messaging checks passed`);
