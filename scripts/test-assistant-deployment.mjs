// Compile and execute the actual Vercel function artifact, without TSX or an
// application bundler masking CommonJS/ESM boundaries. No provider calls/keys.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
const require = createRequire(import.meta.url);
const { build } = require('@vercel/node');
const { FileFsRef, FileBlob } = require('@vercel/build-utils');
const target = await mkdtemp(resolve(tmpdir(), 'maoki-ai-artifact-'));
const root = resolve(import.meta.dirname, '..');
const originalFetch = globalThis.fetch;
const originalKey = process.env.GEMINI_API_KEY;
const originalModel = process.env.GEMINI_MODEL;
const originalURL = process.env.SUPABASE_URL;
const originalPublishable = process.env.SUPABASE_PUBLISHABLE_KEY;
let checks = 0; let paidRequests = 0;
const pass = message => { checks++; console.log('PASS', message); };
try {
  const { output } = await build({ files: { 'api/assistant.ts': new FileFsRef({ fsPath: root + '/api/assistant.ts' }) }, entrypoint: 'api/assistant.ts', workPath: root, repoRootPath: root, config: { zeroConfig: true }, meta: { isDev: true } });
  assert.ok(!Object.keys(output.files).some(path => path.startsWith('src/')));
  for (const [path, file] of Object.entries(output.files)) {
    if (path.startsWith('node_modules/')) continue;
    const blob = await FileBlob.fromStream({ stream: await file.toStream() });
    await mkdir(dirname(target + '/' + path), { recursive: true });
    await writeFile(target + '/' + path, blob.data);
  }
  await symlink(root + '/node_modules', target + '/node_modules', 'dir');
  const calendarOutput=(await build({files:{'api/channels.ts':new FileFsRef({fsPath:root+'/api/channels.ts'})},entrypoint:'api/channels.ts',workPath:root,repoRootPath:root,config:{zeroConfig:true},meta:{isDev:true}})).output;
  for(const [path,file] of Object.entries(calendarOutput.files)) { if(path.startsWith('node_modules/'))continue; const blob=await FileBlob.fromStream({stream:await file.toStream()});await mkdir(dirname(target+'/'+path),{recursive:true});await writeFile(target+'/'+path,blob.data); }
  const calendarHandler=require(target+'/'+calendarOutput.handler).default;assert.equal(typeof calendarHandler,'function');pass('Vercel calendar function and iCal dependency load in the real artifact');
  const handler = require(target + '/' + output.handler).default;
  assert.equal(typeof handler, 'function'); pass('Vercel artifact starts without importing frontend modules');
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_MODEL;
  process.env.SUPABASE_URL = 'https://artifact-test.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-only';
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    if (url.includes('generativelanguage.googleapis.com')) {
      paidRequests++;
      assert.equal(new Headers(options.headers).get('x-goog-api-key'), 'test-server-key-not-a-credential');
      return Response.json({ candidates: [{ content: { parts: [{ text: 'Artifact AI reply' }] } }] });
    }
    assert.ok(url.startsWith('https://artifact-test.supabase.co/'));
    if(!url.includes('/rpc/maoki_calendar_feed')) assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer artifact-token');
    if (url.includes('/auth/v1/user')) return Response.json({ id: '22222222-2222-4222-8222-222222222222', email: 'artifact@example.test', is_anonymous: false });
    if(url.includes('/rpc/maoki_channels')) return Response.json([]);
    if(url.includes('/rpc/maoki_calendar_feed')) return Response.json({events:[{uid:'maoki-artifact@maokihouse',checkIn:'2026-11-01',checkOut:'2026-11-03'}]});
    if (url.includes('/rest/v1/maoki_members')) return Response.json({ workspace_id: '33333333-3333-4333-8333-333333333333', role: 'owner' });
    throw new Error('Unexpected artifact request');
  };
  const invoke = async (method, authorized = true, body) => {
    const result = { statusCode: 0, headers: {}, body: '' };
    const response = { setHeader(name, value) { result.headers[name] = value; return this; }, status(code) { result.statusCode = code; return this; }, send(value) { result.body = value; return this; } };
    await handler({ method, headers: authorized ? { authorization: 'Bearer artifact-token' } : {}, body }, response);
    assert.match(result.headers['content-type'], /application\/json/);
    return { ...result, json: JSON.parse(result.body) };
  };
  assert.equal((await invoke('GET', false)).statusCode, 401); pass('built function returns JSON 401 before authentication');
  const missing = await invoke('GET'); assert.equal(missing.statusCode, 200); assert.equal(missing.json.configured, false); pass('built function reports an absent server key without calling Gemini');
  process.env.GEMINI_API_KEY = 'test-server-key-not-a-credential';
  const configured = await invoke('GET'); assert.equal(configured.statusCode, 200); assert.equal(configured.json.configured, true); assert.equal(paidRequests, 0); assert.ok(!configured.body.includes(process.env.GEMINI_API_KEY)); pass('built function recognizes server GEMINI_API_KEY without revealing it');
  const reply = await invoke('POST', true, { history: [{ role: 'user', text: 'Xin chào' }] }); assert.equal(reply.statusCode, 200); assert.equal(reply.json.reply, 'Artifact AI reply'); assert.equal(paidRequests, 1); pass('built Vercel handler completes authenticated AI flow with mocked provider');

  const invokeCalendar=async(url,authorized=false)=>{const result={statusCode:0,headers:{},body:''};const response={setHeader(name,value){result.headers[name]=value;return this;},status(code){result.statusCode=code;return this;},send(value){result.body=value;return this;}};await calendarHandler({method:'GET',url,headers:authorized?{authorization:'Bearer artifact-token'}:{}},response);return result;};
  assert.equal((await invokeCalendar('/api/channels')).statusCode,401);const channels=await invokeCalendar('/api/channels',true);assert.equal(channels.statusCode,200);assert.deepEqual(JSON.parse(channels.body),{connections:[]});pass('built calendar function authenticates private administration requests');
  const feed=await invokeCalendar('/api/channels?feed='+'a'.repeat(64));assert.equal(feed.statusCode,200);assert.match(feed.headers['content-type'],/text\/calendar/);assert.ok(feed.body.includes('BEGIN:VEVENT'));assert.ok(feed.body.includes('Unavailable'));pass('built Vercel function serves a private-token iCal feed without frontend or Firebase');
  console.log(`${checks} actual Vercel artifact checks passed (mocked network; no live provider requests)`);
} finally {
  globalThis.fetch = originalFetch;
  for (const [name, value] of [['GEMINI_API_KEY', originalKey], ['GEMINI_MODEL', originalModel], ['SUPABASE_URL', originalURL], ['SUPABASE_PUBLISHABLE_KEY', originalPublishable]]) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  await rm(target, { recursive: true, force: true });
}
