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
let workspace = '11111111-1111-4111-8111-111111111111';
let aiSettings: { configured: boolean; allowAgents: boolean; model?: string } | null = null; let useCalls = 0; let orCalls = 0; let orStatus = 200; let orBody = ''; let orAuth = ''; let secretCalls = 0;
const workspaceKey = 'sk-or-v1-workspace0000000000000000';
const fetchStub: typeof fetch = async (input, options) => {
  const url = String(input);
  if (url.startsWith('https://openrouter.ai/')) {
    orCalls++; orBody = String(options?.body); orAuth = new Headers(options?.headers).get('Authorization') || '';
    return Response.json(orStatus === 200 ? { choices: [{ message: { content: '<think>hidden chain</think>Xin chào từ OpenRouter.' } }] } : { error: { message: 'upstream-openrouter-detail' } }, { status: orStatus });
  }
  if (url.includes('/rest/v1/rpc/maoki_ai_settings')) {
    if (!aiSettings) return Response.json({ message: 'not found', code: 'PGRST202' }, { status: 404 });
    const op = JSON.parse(String(options?.body)).op;
    const agentBlocked = role === 'agent' && !aiSettings.allowAgents;
    if (op === 'status') return Response.json({ configured: aiSettings.configured, keyHint: aiSettings.configured ? '0000' : '', model: aiSettings.model || 'nvidia/nemotron-3.5-super-vl:free', allowAgents: aiSettings.allowAgents, canManage: ['owner', 'manager'].includes(role), canUse: ['owner', 'manager'].includes(role) || (role === 'agent' && aiSettings.allowAgents), updatedAt: null, updatedBy: '' });
    if (op === 'use') { useCalls++; return agentBlocked ? Response.json({ message: 'Chủ không gian chưa cho phép nhân viên dùng trợ lý AI', code: 'P0001' }, { status: 400 }) : Response.json({ ok: true }); }
    if (op === 'secret') { secretCalls++; return agentBlocked ? Response.json({ message: 'Chủ không gian chưa cho phép nhân viên dùng trợ lý AI', code: 'P0001' }, { status: 400 }) : Response.json({ apiKey: aiSettings.configured ? workspaceKey : '', model: 'nvidia/nemotron-3.5-super-vl:free' }); }
  }
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
for(const rule of vercel.headers)pathToRegexp(rule.source);
const framing=pathToRegexp(vercel.headers[1].source);assert.equal(framing.test('/admin/dashboard'),true);assert.equal(framing.test('/'),true);assert.equal(framing.test('/chat/abc123'),false);
assert.ok(JSON.stringify(vercel.headers[1]).includes("frame-ancestors 'self'"));
const routing=pathToRegexp(vercel.rewrites[0].source);assert.equal(routing.test('/api/assistant'),false);assert.equal(routing.test('/api/channels'),false);assert.equal(routing.test('/api/workspace'),true);
 pass('Vercel routes the Supabase assistant independently of the Firebase API');
// ---- OpenRouter with a key saved in the web settings ----
workspace = '44444444-4444-4444-8444-444444444444'; // fresh per-instance burst window
aiSettings = { configured: true, allowAgents: false };
const statusText = await (await handleAssistant(request(), {}, fetchStub)).text();
assert.ok(statusText.includes('"provider":"OpenRouter"')); assert.ok(statusText.includes('nvidia/nemotron-3.5-super-vl:free')); assert.ok(!statusText.includes(workspaceKey)); assert.equal(secretCalls, 0);
pass('status reports OpenRouter, default model and key hint without reading or returning the key');
const history = { history: [{ role: 'user', text: 'Chào' }, { role: 'model', text: 'Chào bạn' }, { role: 'user', text: 'Soạn tin' }], includeContext: false };
response = await handleAssistant(request(history), {}, fetchStub); const orReply = await response.text();
assert.equal(response.status, 200); assert.ok(orReply.includes('Xin chào từ OpenRouter.')); assert.ok(!orReply.includes('hidden chain')); assert.ok(!orReply.includes(workspaceKey));
assert.equal(orAuth, 'Bearer ' + workspaceKey); const sent = JSON.parse(orBody); assert.equal(sent.model, 'nvidia/nemotron-3.5-super-vl:free'); assert.deepEqual(sent.messages.map((m: { role: string }) => m.role), ['system', 'user', 'assistant', 'user']);
pass('OpenRouter call uses the saved key only in the server Authorization header, maps roles and strips reasoning');
role = 'agent'; const before = orCalls; response = await handleAssistant(request(question), {}, fetchStub);
assert.equal(response.status, 403); assert.equal(orCalls, before); aiSettings.allowAgents = true;
assert.equal((await handleAssistant(request(question), {}, fetchStub)).status, 200); assert.equal((await handleAssistant(request({ action: 'test' }), {}, fetchStub)).status, 403); role = 'owner';
pass('agents need the owner\'s permission to spend the workspace key and cannot run connection tests');
response = await handleAssistant(request({ action: 'test' }), {}, fetchStub); assert.equal(response.status, 200); assert.equal((await response.json()).ok, true); pass('owners can test the saved key');
orStatus = 401; response = await handleAssistant(request(question), {}, fetchStub); const orError = await response.text(); assert.equal(response.status, 502); assert.ok(orError.includes('API key OpenRouter')); assert.ok(!orError.includes('upstream-openrouter-detail')); orStatus = 200;
pass('OpenRouter errors are explained without returning upstream bodies');
workspace = '55555555-5555-4555-8555-555555555555'; const secretsBefore = secretCalls;
response = await handleAssistant(request(question), { OPENROUTER_API_KEY: 'sk-or-v1-serverkey00000000000000' }, fetchStub);
assert.equal(response.status, 200); assert.equal(orAuth, 'Bearer sk-or-v1-serverkey00000000000000'); assert.equal(secretCalls, secretsBefore);
pass('a server OPENROUTER_API_KEY takes precedence and the database key is not read');
// Regression (audit finding api/_lib/assistant.ts:tenant-model-on-operator-openrouter-key)
workspace = '77777777-7777-4777-8777-777777777777'; aiSettings = { configured: false, allowAgents: false, model: 'openai/expensive-model' };
const usesBefore = useCalls;
response = await handleAssistant(request(question), { OPENROUTER_API_KEY: 'sk-or-v1-serverkey00000000000000', OPENROUTER_MODEL: 'nvidia/nemotron-3.5-super-vl:free' }, fetchStub);
assert.equal(response.status, 200); assert.equal(JSON.parse(orBody).model, 'nvidia/nemotron-3.5-super-vl:free'); assert.equal(useCalls, usesBefore + 1);
response = await handleAssistant(request(question), { OPENROUTER_API_KEY: 'sk-or-v1-serverkey00000000000000' }, fetchStub);
assert.equal(JSON.parse(orBody).model, 'nvidia/nemotron-3.5-super-vl:free');
pass('a server key only bills the operator model and every call is charged to the durable workspace budget');
role = 'agent'; const orBefore = orCalls;
assert.equal((await handleAssistant(request(question), { OPENROUTER_API_KEY: 'sk-or-v1-serverkey00000000000000' }, fetchStub)).status, 403); assert.equal(orCalls, orBefore);
const agentStatus = await (await handleAssistant(request(), { OPENROUTER_API_KEY: 'sk-or-v1-serverkey00000000000000' }, fetchStub)).json(); assert.equal(agentStatus.canUse, false); role = 'owner';
pass('the owner\'s allow-staff switch also governs server-paid keys');
aiSettings = null; workspace = '66666666-6666-4666-8666-666666666666';
const upgrade = await (await handleAssistant(request(), {}, fetchStub)).json(); assert.equal(upgrade.needsUpgrade, true); assert.equal(upgrade.configured, false);
assert.equal((await handleAssistant(request(question), {}, fetchStub)).status, 503); pass('databases without the AI settings migration report the upgrade step');
console.log(`${checks} AI authentication, privacy and provider checks passed (mocked network; no live Gemini/OpenRouter request)`);
