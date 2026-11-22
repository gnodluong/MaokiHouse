import assert from 'node:assert/strict';
import { handleReviews } from '../api/_lib/reviews';
import { callStatus, handleInbound, normaliseCall } from '../api/_lib/messaging';

let checks = 0; const ok = (condition: unknown, message: string) => { assert.ok(condition, message); checks++; console.log('PASS', message); };
const j = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const ENV = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' } as NodeJS.ProcessEnv;
const RECORD = '11111111-1111-4111-8111-111111111111';

interface World { calls: string[]; upserts: { items: { reviewId: string; rating: number; reply: string }[] }[]; context: object; pages: object[]; oauth: { status: number; body: object }; replyStatus: number; user: boolean }
const fresh = (): World => ({ calls: [], upserts: [], context: { configured: true, config: { clientId: 'cid', clientSecret: 'cs', refreshToken: 'rt', accountId: '123', locationId: '456' } }, pages: [], oauth: { status: 200, body: { access_token: 'ACCESS' } }, replyStatus: 200, user: true });
const fakeFetch = (world: World): typeof fetch => (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input); world.calls.push(`${init?.method || 'GET'} ${url}`);
  if (url.includes('/auth/v1/user')) return world.user ? j({ id: 'u', aud: 'authenticated', email: 'o@x.test', app_metadata: {}, user_metadata: {}, created_at: '2024-01-01' }) : j({}, 401);
  if (url.includes('/rest/v1/rpc/maoki_reviews')) { const body = JSON.parse(String(init?.body)); if (body.op === 'context') return j(world.context); if (body.op === 'upsert') { world.upserts.push(body.payload); return j({ added: body.payload.items.length, updated: 0 }); } }
  if (url.startsWith('https://oauth2.googleapis.com/token')) return j(world.oauth.body, world.oauth.status);
  if (url.includes('/reviews?')) return j(world.pages.shift() || { reviews: [] });
  if (url.endsWith('/reply')) { world.calls.push('body:' + String(init?.body) + ':' + (init?.headers as Record<string, string>).Authorization); return j({ comment: 'x' }, world.replyStatus); }
  throw new Error('unexpected ' + url);
}) as typeof fetch;
const call = (world: World, payload: object, auth = 'Bearer t') => handleReviews(new Request('http://x/api/reviews', { method: 'POST', headers: { authorization: auth }, body: JSON.stringify(payload) }), ENV, fakeFetch(world));

let world = fresh(); world.pages = [{ reviews: [{ reviewId: 'R1', name: 'accounts/123/locations/456/reviews/R1', reviewer: { displayName: 'Minh' }, starRating: 'FIVE', comment: 'Tuyệt vời', createTime: '2099-01-01T00:00:00Z' }, { reviewId: 'R2', reviewer: {}, starRating: 'TWO', comment: '', createTime: '2099-01-02T00:00:00Z', reviewReply: { comment: 'Xin lỗi', updateTime: '2099-01-03T00:00:00Z' } }, { reviewId: 'R3', starRating: 'STAR_RATING_UNSPECIFIED' }], nextPageToken: 'p2' }, { reviews: [{ reviewId: 'R4', starRating: 'ONE', reviewer: { displayName: 'Ann' } }] }];
let body = await (await call(world, { action: 'sync' })).json();
ok(body.ok === true && body.fetched === 3 && world.upserts[0].items.map(item => item.rating).join() === '5,2,1', 'sync pages through reviews and maps star ratings');
ok(world.upserts[0].items[1].reply === 'Xin lỗi' && world.calls.some(entry => entry.includes('pageToken=p2')), 'existing replies come across and pagination follows nextPageToken');
ok(world.calls.some(entry => entry.includes('/v4/accounts/123/locations/456/reviews')), 'reviews are read from the configured location');
world = fresh(); world.context = { configured: true, review: { reviewName: 'accounts/123/locations/456/reviews/R9', reviewId: 'R9' }, config: { clientId: 'c', clientSecret: 's', refreshToken: 'r', accountId: '123', locationId: '456' } };
body = await (await call(world, { action: 'reply', recordId: RECORD, text: 'Cảm ơn bạn!' })).json(); ok(body.ok === true && world.calls.some(entry => entry.startsWith('PUT https://mybusiness.googleapis.com/v4/accounts/123/locations/456/reviews/R9/reply')) && world.calls.some(entry => entry.includes('"comment":"Cảm ơn bạn!"') && entry.endsWith('Bearer ACCESS')), 'reply is PUT to the review with a fresh access token');
world = fresh(); world.context = { configured: true, review: { reviewName: 'accounts/999/locations/1/reviews/X', reviewId: 'X' }, config: { clientId: 'c', clientSecret: 's', refreshToken: 'r', accountId: '123', locationId: '456' } };
body = await (await call(world, { action: 'reply', recordId: RECORD, text: 'x' })).json(); ok(body.ok === false && !world.calls.some(entry => entry.startsWith('PUT')), 'a review from another location is never replied to');
world = fresh(); world.context = { configured: true, review: { reviewName: '../../evil', reviewId: 'X' }, config: { accountId: '123', locationId: '456' } }; body = await (await call(world, { action: 'reply', recordId: RECORD, text: 'x' })).json(); ok(body.ok === false, 'malformed review names are rejected (no path injection)');
world = fresh(); world.context = { configured: true, config: { accountId: '12/../3', locationId: '456' } }; body = await (await call(world, { action: 'sync' })).json(); ok(body.ok === false && /số/.test(body.error), 'account and location ids must be numeric');
world = fresh(); world.oauth = { status: 400, body: { error: 'invalid_grant' } }; body = await (await call(world, { action: 'sync' })).json(); ok(body.ok === false && /hết hạn/.test(body.error), 'revoked refresh token is explained');
world = fresh(); world.pages = []; world.calls = []; body = await (await call(world, { action: 'sync' })).json(); ok(body.ok === true && body.fetched === 0, 'an empty review list syncs cleanly');
world = fresh(); world.context = { configured: false }; body = await (await call(world, { action: 'sync' })).json(); ok(body.ok === false && /Kênh nhắn tin/.test(body.error), 'an unconfigured Google channel is reported');
world = fresh(); let res = await call(world, { action: 'sync' }, ''); ok(res.status === 401, 'sync requires a signed-in user');
world = fresh(); res = await call(world, { action: 'drop' }); ok(res.status === 400, 'unknown actions are rejected');
res = await handleReviews(new Request('http://x/api/reviews', { method: 'GET' })); ok(res.status === 405, 'reviews endpoint is POST only');

// Call webhooks
ok(callStatus('completed', 30) === 'answered' && callStatus('completed', 0) === 'missed' && callStatus('no-answer', 0) === 'missed' && callStatus('busy', 0) === 'busy' && callStatus('failed', 0) === 'failed' && callStatus('VOICEMAIL', 5) === 'voicemail', 'provider call statuses are normalised');
const twilio = normaliseCall('application/x-www-form-urlencoded', new URLSearchParams({ CallSid: 'CA1', From: '+84987654321', To: '+842812345678', CallStatus: 'completed', CallDuration: '42', Direction: 'inbound', RecordingUrl: 'https://api.twilio.com/rec/RE1' }).toString());
ok(twilio?.callId === 'CA1' && twilio.status === 'answered' && twilio.durationSec === 42 && twilio.direction === 'inbound' && twilio.recordingUrl.startsWith('https://'), 'twilio-style form callbacks are understood');
const generic = normaliseCall('application/json', JSON.stringify({ callId: 'X1', direction: 'outbound', to: '0911222333', status: 'ANSWERED', duration: 90, timestamp: 1700000000 })); ok(generic?.direction === 'outbound' && generic.startedAt.startsWith('2023-11-14') && generic.durationSec === 90, 'generic JSON call events and unix timestamps are understood');
ok(normaliseCall('application/json', JSON.stringify({ direction: 'inbound' })) === null && normaliseCall('application/json', '{bad') === null && normaliseCall('application/json', JSON.stringify({ callId: 'A', from: '1', recordingUrl: 'http://x/y.mp3' }))?.recordingUrl === '', 'incomplete events are ignored and insecure recording links dropped');
const sent: string[] = []; const spy = (async (input: RequestInfo | URL, init?: RequestInit) => { sent.push(String(init?.body)); return j({ ok: true }); }) as typeof fetch;
res = await handleInbound(new Request(`http://x/api/inbound?token=${'a'.repeat(64)}`, { method: 'POST', headers: { 'content-type': 'application/json' } }), JSON.stringify({ callId: 'Z1', direction: 'inbound', from: '0987654321', status: 'missed' }), ENV, spy);
ok(res.status === 200 && sent.some(entry => entry.includes('"call":{') && entry.includes('"callId":"Z1"')), 'phone webhook forwards the normalised call event to the database');
console.log(`${checks} review and call checks passed`);
