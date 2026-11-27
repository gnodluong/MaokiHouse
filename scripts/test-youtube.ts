import assert from 'node:assert/strict';
import { handleYouTube } from '../supabase/functions/_shared/youtube';

let checks = 0; const ok = (condition: unknown, message: string) => { assert.ok(condition, message); checks++; console.log('PASS', message); };
const j = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const ENV = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' } as NodeJS.ProcessEnv;
const RECORD = '11111111-1111-4111-8111-111111111111';

interface World { calls: string[]; upserts: { items: { commentId: string; reply: string; likes: number }[] }[]; context: object; pages: { status: number; body: object }[]; oauth: { status: number; body: object }; insert: { status: number; body: object }; user: boolean }
const fresh = (): World => ({ calls: [], upserts: [], context: { configured: true, config: { clientId: 'c', clientSecret: 's', refreshToken: 'r', channelId: 'UCabc12345' } }, pages: [], oauth: { status: 200, body: { access_token: 'ACCESS' } }, insert: { status: 200, body: {} }, user: true });
const fakeFetch = (world: World): typeof fetch => (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input); world.calls.push(`${init?.method || 'GET'} ${url}`);
  if (url.includes('/auth/v1/user')) return world.user ? j({ id: 'u', aud: 'authenticated', email: 'o@x.test', app_metadata: {}, user_metadata: {}, created_at: '2024-01-01' }) : j({}, 401);
  if (url.includes('/rest/v1/rpc/maoki_youtube')) { const body = JSON.parse(String(init?.body)); if (body.op === 'context') return j(world.context); if (body.op === 'upsert') { world.upserts.push(body.payload); return j({ added: body.payload.items.length, updated: 0 }); } }
  if (url.startsWith('https://oauth2.googleapis.com/token')) return j(world.oauth.body, world.oauth.status);
  if (url.includes('/youtube/v3/commentThreads')) { const page = world.pages.shift() || { status: 200, body: { items: [] } }; return j(page.body, page.status); }
  if (url.includes('/youtube/v3/comments')) { world.calls.push('body:' + String(init?.body) + ':' + (init?.headers as Record<string, string>).Authorization); return j(world.insert.body, world.insert.status); }
  throw new Error('unexpected ' + url);
}) as typeof fetch;
const call = (world: World, payload: object, auth = 'Bearer t') => handleYouTube(new Request('http://x/api/youtube', { method: 'POST', headers: { authorization: auth }, body: JSON.stringify(payload) }), ENV, fakeFetch(world));

let world = fresh();
world.pages = [{ status: 200, body: { items: [
  { id: 'Ugx1', snippet: { videoId: 'vid1', totalReplyCount: 1, topLevelComment: { id: 'Ugx1', snippet: { authorDisplayName: 'Lan', authorChannelId: { value: 'UCfan1' }, textOriginal: 'Video hay quá!', publishedAt: '2099-01-01T00:00:00Z', likeCount: 4 } } }, replies: { comments: [{ snippet: { authorChannelId: { value: 'UCabc12345' }, textOriginal: 'Cảm ơn bạn!', publishedAt: '2099-01-02T00:00:00Z' } }] } },
  { id: 'Ugx2', snippet: { videoId: 'vid2', totalReplyCount: 1, topLevelComment: { id: 'Ugx2', snippet: { authorDisplayName: 'Bob', textDisplay: 'Where?', likeCount: 0 } } }, replies: { comments: [{ snippet: { authorChannelId: { value: 'UCsomeoneelse' }, textOriginal: 'Da Lat' } }] } },
  { id: 'Ugx3', snippet: { topLevelComment: { id: 'Ugx3', snippet: { authorDisplayName: 'Empty' } } } }], nextPageToken: 'p2' } }, { status: 200, body: { items: [{ id: 'Ugx4', snippet: { topLevelComment: { id: 'Ugx4', snippet: { authorDisplayName: 'Kim', textOriginal: 'Hi' } } } }] } }];
let body = await (await call(world, { action: 'sync' })).json();
ok(body.ok === true && body.fetched === 3 && world.upserts[0].items.map(item => item.commentId).join() === 'Ugx1,Ugx2,Ugx4', 'sync pages through comment threads and skips empty ones');
ok(world.upserts[0].items[0].reply === 'Cảm ơn bạn!' && world.upserts[0].items[1].reply === '' && world.upserts[0].items[0].likes === 4, 'only a reply from our own channel marks a thread as answered');
ok(world.calls.some(entry => entry.includes('allThreadsRelatedToChannelId=UCabc12345') && entry.includes('pageToken=p2')), 'comments come from the configured channel and follow nextPageToken');
world = fresh(); world.context = { configured: true, comment: { commentId: 'Ugx9abc' }, config: { clientId: 'c', clientSecret: 's', refreshToken: 'r', channelId: 'UCabc12345' } };
body = await (await call(world, { action: 'reply', recordId: RECORD, text: 'Cảm ơn bạn!' })).json(); ok(body.ok === true && world.calls.some(entry => entry.startsWith('POST https://www.googleapis.com/youtube/v3/comments?part=snippet')) && world.calls.some(entry => entry.includes('"parentId":"Ugx9abc"') && entry.includes('"textOriginal":"Cảm ơn bạn!"') && entry.endsWith('Bearer ACCESS')), 'reply is inserted under the parent comment with a fresh access token');
world = fresh(); world.context = { configured: true, comment: { commentId: '../evil' }, config: { channelId: 'UCabc12345' } }; body = await (await call(world, { action: 'reply', recordId: RECORD, text: 'x' })).json(); ok(body.ok === false && !world.calls.some(entry => entry.startsWith('POST https://www.googleapis')), 'a malformed comment id is rejected before any API call');
world = fresh(); world.context = { configured: true, config: { channelId: 'bad/channel' } }; body = await (await call(world, { action: 'sync' })).json(); ok(body.ok === false && /Channel ID/.test(body.error), 'channel id is validated');
world = fresh(); world.pages = [{ status: 403, body: { error: { errors: [{ reason: 'quotaExceeded' }], message: 'quota' } } }]; body = await (await call(world, { action: 'sync' })).json(); ok(body.ok === false && /hạn mức/.test(body.error), 'daily API quota exhaustion is explained');
world = fresh(); world.insert = { status: 403, body: { error: { errors: [{ reason: 'commentsDisabled' }] } } }; world.context = { configured: true, comment: { commentId: 'Ugx9abc' }, config: { clientId: 'c', clientSecret: 's', refreshToken: 'r', channelId: 'UCabc12345' } }; body = await (await call(world, { action: 'reply', recordId: RECORD, text: 'x' })).json(); ok(body.ok === false && /tắt bình luận/.test(body.error), 'disabled comments are explained');
world = fresh(); world.oauth = { status: 400, body: { error: 'invalid_grant' } }; body = await (await call(world, { action: 'sync' })).json(); ok(body.ok === false && /hết hạn/.test(body.error), 'revoked refresh token is explained');
world = fresh(); world.context = { configured: false }; body = await (await call(world, { action: 'sync' })).json(); ok(body.ok === false && /Kênh nhắn tin/.test(body.error), 'an unconfigured YouTube channel is reported');
world = fresh(); let res = await call(world, { action: 'sync' }, ''); ok(res.status === 401, 'sync requires a signed-in user');
world = fresh(); world.user = false; res = await call(world, { action: 'sync' }); ok(res.status === 401, 'an invalid session token is rejected');
world = fresh(); res = await call(world, { action: 'delete' }); ok(res.status === 400, 'unknown actions are rejected');
res = await handleYouTube(new Request('http://x/api/youtube', { method: 'GET' })); ok(res.status === 405, 'youtube endpoint is POST only');
console.log(`${checks} youtube checks passed`);
