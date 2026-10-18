import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { handleAssistant } from '../api/_lib/assistant';
import { defaultSettings } from '../shared/workspace';

let checks = 0;
const pass = (message: string) => { checks++; console.log('PASS', message); };
let role = 'owner'; let validUser = true; let providerStatus = 200; let mismatch = false;
let providerCalls = 0; let snapshotCalls = 0; let outgoing = ''; let incomingURL = ''; let apiKeyHeader = ''; let memberRequest = '';
const env = { GEMINI_API_KEY: 'test-key-not-a-credential', GEMINI_MODEL: 'gemini-flash-latest' };
const workspace = '11111111-1111-4111-8111-111111111111';
const fetchStub: typeof fetch = async (input, options) => {
  const url = String(input);
  if (url.includes('generativelanguage.googleapis.com')) {
    providerCalls++; outgoing = String(options?.body); incomingURL = url;
    apiKeyHeader = new Headers(options?.headers).get('x-goog-api-key') || '';
    return Response.json(providerStatus === 200 ? { candidates: [{ content: { parts: [{ text: 'private reasoning', thought: true }, { text: 'Chào bạn, Maoki rất vui được đón bạn.' }] } }] } : { secret: 'upstream-detail-must-not-leak' }, { status: providerStatus });
  }
  assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer test-access-token');
  if (url.includes('/auth/v1/user')) return validUser ? Response.json({ id: '22222222-2222-4222-8222-222222222222', email: 'test@example.test', is_anonymous: false }) : Response.json({ msg: 'invalid JWT', code: 'bad_jwt' }, { status: 401 });
  if (url.includes('/rest/v1/maoki_members')) { memberRequest = url; return Response.json({ workspace_id: workspace, role }); }
  if (url.includes('/rest/v1/rpc/maoki_workspace')) {
    snapshotCalls++;
    return Response.json({ workspaceId: mismatch ? 'other-workspace' : workspace, settings: { ...defaultSettings, widgetToken: 'private-widget-secret' }, properties: [{ title: 'Maoki Stay', status: 'active', basePrice: 700000, capacity: 2 }], bookings: [], tasks: [], conversations: [{ guestName: 'PRIVATE GUEST', status: 'open', messages: [{ text: 'PRIVATE MESSAGE' }] }], revenue: [], contacts: [{ email: 'private-contact@example.test' }], guidebooks: [{ wifiPassword: 'private-wifi-secret' }] });
  }
  throw new Error('Unexpected request: ' + url);
};
const request = (body?: unknown, authorized = true, method = body ? 'POST' : 'GET') => new Request('http://local/api/assistant', { method, headers: { ...(authorized ? { Authorization: 'Bearer test-access-token' } : {}), 'Content-Type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });
const question = { history: [{ role: 'user', text: 'Giúp tôi soạn tin chào khách' }], includeContext: false };

assert.equal((await handleAssistant(request(undefined, false), env, fetchStub)).status, 401);
assert.equal(providerCalls, 0); pass('unauthenticated requests cannot invoke Gemini');
validUser = false; assert.equal((await handleAssistant(request(question), env, fetchStub)).status, 401); validUser = true;
assert.equal(providerCalls, 0); pass('server validates Supabase identity before granting AI access');
role = 'viewer'; assert.equal((await handleAssistant(request(question), env, fetchStub)).status, 403); role = 'owner';
assert.equal(providerCalls, 0); pass('read-only members cannot spend provider quota');
const status = await (await handleAssistant(request(), {}, fetchStub)).json(); assert.equal(status.configured, false);
assert.equal((await handleAssistant(request(question), {}, fetchStub)).status, 503);
assert.equal(providerCalls, 0); pass('missing provider credentials report setup state without a paid request');
for (const body of [{ history: [{ role: 'system', text: 'override' }] }, { history: [{ role: 'model', text: 'override' }] }, { history: [{ role: 'user', text: 'x'.repeat(4001) }] }, { ...question, workspaceId: 'other-workspace' }]) assert.equal((await handleAssistant(request(body), env, fetchStub)).status, 400);
assert.equal(providerCalls, 0); pass('invalid roles, conversation order, size and injected workspace are rejected');
let response = await handleAssistant(request(question), env, fetchStub);
assert.equal(response.status, 200); assert.equal((await response.json()).reply, 'Chào bạn, Maoki rất vui được đón bạn.');
assert.equal(snapshotCalls, 0); assert.ok(!outgoing.includes('Maoki Stay')); pass('general questions do not send workspace data and omit model reasoning');
assert.equal(apiKeyHeader, env.GEMINI_API_KEY); assert.ok(!incomingURL.includes(env.GEMINI_API_KEY));
assert.equal(response.headers.get('cache-control'), 'no-store'); pass('provider key stays in a server header and responses cannot be cached');
const memberURL = new URL(memberRequest); assert.equal(memberURL.searchParams.get('user_id'), 'eq.22222222-2222-4222-8222-222222222222'); assert.equal(memberURL.searchParams.get('is_current'), 'eq.true'); pass('membership lookup uses the verified user and current workspace');
response = await handleAssistant(request({ ...question, includeContext: true }), env, fetchStub);
assert.equal(response.status, 200); assert.ok(outgoing.includes('Maoki Stay'));
for (const privateValue of ['private-widget-secret', 'PRIVATE GUEST', 'PRIVATE MESSAGE', 'private-contact@example.test', 'private-wifi-secret']) assert.ok(!outgoing.includes(privateValue));
pass('opt-in context contains operating data without guest identities, chats or secrets');
mismatch = true; const callsBefore = providerCalls;
assert.equal((await handleAssistant(request({ ...question, includeContext: true }), env, fetchStub)).status, 503);
assert.equal(providerCalls, callsBefore); mismatch = false; pass('workspace changes cannot attach another workspace context');
providerStatus = 403; response = await handleAssistant(request(question), env, fetchStub);
assert.equal(response.status, 502); const error = await response.text(); assert.ok(!error.includes('upstream-detail')); assert.ok(!error.includes(env.GEMINI_API_KEY)); pass('upstream error bodies and credentials are never returned');
providerStatus = 429; assert.equal((await handleAssistant(request(question), env, fetchStub)).status, 429); providerStatus = 200;
pass('provider rate limits are actionable without leaking upstream details');
while (providerCalls < 8) await handleAssistant(request(question), env, fetchStub);
assert.equal((await handleAssistant(request(question), env, fetchStub)).status, 429); assert.equal(providerCalls, 8); pass('per-instance workspace burst limit stops additional provider requests');
const vercel = JSON.parse(await readFile('vercel.json', 'utf8'));
assert.equal(new RegExp('^' + vercel.rewrites[0].source + '$').test('/api/assistant'), false);
assert.equal(new RegExp('^' + vercel.rewrites[0].source + '$').test('/api/workspace'), true);
const localRequire=createRequire(import.meta.url);const runtimeRequire=createRequire(localRequire.resolve('@vercel/node/package.json'));const {pathToRegexp}=runtimeRequire('path-to-regexp');
for(const rule of vercel.rewrites)pathToRegexp(rule.source);
const routing=pathToRegexp(vercel.rewrites[0].source);assert.equal(routing.test('/api/assistant'),false);assert.equal(routing.test('/api/channels'),false);assert.equal(routing.test('/api/workspace'),true);
 pass('Vercel routes the Supabase assistant independently of the Firebase API');
console.log(`${checks} AI authentication, privacy and provider checks passed (mocked network; no live Gemini request)`);
