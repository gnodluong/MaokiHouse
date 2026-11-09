// Dev-only: renders every admin page against an in-memory PostgreSQL (PGlite)
// with the real migrations and stubbed Supabase Auth, and saves screenshots.
// Usage: vite on :5173, then `node scripts/admin-screenshots.mjs <outDir> [width]`.
import { PGlite } from '@electric-sql/pglite';
import { chromium } from 'playwright';
import { readFile, readdir, mkdir } from 'node:fs/promises';

const out = process.argv[2] || '/tmp/maoki-admin-shots';
const width = Number(process.argv[3] || 1440);
await mkdir(out, { recursive: true });
const db = new PGlite();
const uid = '44444444-4444-4444-8444-444444444444';
const email = 'owner@maokihouse.test';
await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz); grant usage on schema auth to anon,authenticated;
create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
insert into auth.users values('${uid}','${email}',now());`);
for (const file of (await readdir('supabase/migrations')).filter(x => x.endsWith('.sql')).sort()) await db.exec(await readFile('supabase/migrations/' + file, 'utf8'));
const asUser = async () => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: uid, email, is_anonymous: false })]); await db.exec('set role authenticated'); };
const rpc = async (op, kind = '', id = null, payload = {}) => { await asUser(); return (await db.query('select public.maoki_workspace($1,$2,$3,$4) as result', [op, kind, id, JSON.stringify(payload)])).rows[0].result; };

// Seed a realistic small operation.
await rpc('snapshot');
await rpc('settings', '', null, { businessName: 'MaokiHouse', widgetEnabled: true });
const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const rooms = [];
for (const [title, address, price, img] of [['The Nest · Thảo Điền', 'Thảo Điền, TP. Thủ Đức', 950000, '/rooms/maoki-1.jpg'], ['Garden Loft · Quận 1', 'Đa Kao, Quận 1', 1450000, '/rooms/maoki-2.jpg'], ['Riverside · Bình Thạnh', 'Phường 22, Bình Thạnh', 1200000, '/rooms/maoki-3.jpg'], ['Little Saigon · Quận 3', 'Võ Thị Sáu, Quận 3', 850000, '/rooms/maoki-4.jpg']]) {
  rooms.push(await rpc('save', 'properties', null, { title, address, basePrice: price, capacity: 2, bedrooms: 1, imageURLs: [img], published: true }));
}
const guests = [['Morgan Louise', 'airbnb', 1, 4], ['Nguyễn Minh Anh', 'booking', 2, 5], ['Paige Turner', 'direct', 0, 3], ['Lê Hoàng', 'airbnb', 6, 9], ['Sato Yuki', 'booking', 8, 11]];
for (const [i, [guestName, source, a, b]] of guests.entries()) await rpc('save', 'bookings', null, { propertyId: rooms[i % 4].id, guestName, source, checkIn: day(a), checkOut: day(b), payoutAmount: 2400000 + i * 300000, status: i === 2 ? 'pending' : 'confirmed' });
for (const [title, p] of [['Dọn phòng sau trả phòng', 'high'], ['Thay khăn tắm', 'normal'], ['Kiểm tra điều hòa', 'normal']]) await rpc('save', 'tasks', null, { title, propertyId: rooms[0].id, dueDate: day(1), priority: p });
for (const [n, d] of [['Tiền phòng tháng này', 'booking_payout'], ['Điện nước', 'expense']]) await rpc('save', 'revenue', null, { description: n, type: d, amount: d === 'booking_payout' ? 18500000 : 2100000, date: day(0), propertyId: rooms[1].id });
await rpc('save', 'contacts', null, { name: 'Morgan Louise', email: 'morgan@example.test', source: 'airbnb', stage: 'guest' });

const user = { id: uid, email, aud: 'authenticated', role: 'authenticated', email_confirmed_at: new Date().toISOString(), created_at: new Date().toISOString(), app_metadata: { provider: 'email' }, user_metadata: {} };
const token = [{ alg: 'HS256', typ: 'JWT' }, { sub: uid, email, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }, 'stub'].map((x, i) => i < 2 ? Buffer.from(JSON.stringify(x)).toString('base64url') : x).join('.');
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium' });
const context = await browser.newContext({ viewport: { width, height: 900 }, ...(process.env.IPHONE ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', isMobile: true, hasTouch: true } : {}) });
let queue = Promise.resolve();
const serial = job => { const p = queue.then(job); queue = p.catch(() => {}); return p; };
await context.route('https://*.supabase.co/**', route => serial(async () => {
  const request = route.request(); const url = new URL(request.url());
  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'Content-Type': 'application/json' };
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
  if (url.pathname === '/auth/v1/token') return route.fulfill({ status: 200, headers, body: JSON.stringify({ access_token: token, refresh_token: 'r', expires_in: 3600, token_type: 'bearer', user }) });
  if (url.pathname === '/auth/v1/user') return route.fulfill({ status: 200, headers, body: JSON.stringify(user) });
  if (url.pathname.startsWith('/rest/v1/rpc/')) {
    try {
      const body = request.postDataJSON() || {}; const name = url.pathname.split('/').at(-1);
      await asUser();
      let result;
      if (name === 'maoki_workspace') result = (await db.query('select public.maoki_workspace($1,$2,$3,$4) as result', [body.op, body.kind || '', body.record_id || null, JSON.stringify(body.payload || {})])).rows[0].result;
      else if (name === 'maoki_channels') result = (await db.query('select public.maoki_channels($1,$2,$3) as result', [body.op, body.connection_id || null, JSON.stringify(body.payload || {})])).rows[0].result;
      else if (name === 'maoki_ai_settings') result = (await db.query('select public.maoki_ai_settings($1,$2) as result', [body.op, JSON.stringify(body.payload || {})])).rows[0].result;
      else throw new Error('Unexpected RPC ' + name);
      return route.fulfill({ status: 200, headers, body: JSON.stringify(result) });
    } catch (error) { return route.fulfill({ status: 400, headers, body: JSON.stringify({ message: error.message, code: 'P0001' }) }); }
  }
  return route.fulfill({ status: 404, headers, body: '{}' });
}));
await context.route('**/api/channels**', route => serial(async () => {
  await asUser();
  const call = async (op, id = null, payload = {}) => (await db.query('select public.maoki_channels($1,$2,$3) as result', [op, id, JSON.stringify(payload)])).rows[0].result;
  const body = route.request().method() === 'POST' ? route.request().postDataJSON() : null;
  try {
    if (!body) return route.fulfill({ json: { connections: await call('list') } });
    if (body.action === 'disconnect') { await call('disconnect', body.id); return route.fulfill({ json: { disconnected: true } }); }
    let id = body.id; if (body.action === 'connect') id = (await call('save', null, body)).id;
    const claim = await call('claim', id);
    return route.fulfill({ json: { saved: true, id, ...await call('finish', id, { nonce: claim.nonce, events: [{ uid: 'demo-' + id, checkIn: day(10), checkOut: day(12) }] }) } });
  } catch (error) { return route.fulfill({ status: 400, json: { error: error.message } }); }
}));
const aiStatus = process.env.AI_GEMINI ? { configured: true, provider: 'Gemini', model: 'gemini-flash-latest', source: 'server', keyHint: '', allowAgents: false, canManage: true, canUse: true, updatedAt: null } : { configured: false, provider: 'OpenRouter', model: 'nvidia/nemotron-3.5-super-vl:free', source: null, keyHint: '', allowAgents: false, canManage: true, canUse: true, updatedAt: null };
await context.route('**/api/assistant', route => route.fulfill({ json: route.request().method() === 'GET' ? aiStatus : { reply: 'Bản nháp mẫu.', ok: true, model: 'nvidia/nemotron-3.5-super-vl:free' } }));

if (process.env.THEME) await context.addInitScript(theme => { localStorage.setItem('maoki:admin-theme', theme); }, process.env.THEME);
const page = await context.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
const origin = 'http://127.0.0.1:5173';
await page.goto(origin + '/admin');
await page.screenshot({ path: `${out}/00-login.png` });
await page.locator('#login-email').fill(email); await page.locator('#login-password').fill('local-only');
await page.locator('form button[type=submit]').click();
await page.waitForURL('**/admin/dashboard'); await page.waitForTimeout(1200);
const pages = (process.env.PAGES || ',calendar,bookings,properties,rates,tasks,guidebooks,messages,contacts,automations,campaigns,replies,ai,revenue,reports,owners,hr,channels,settings').split(',');
for (const [i, p] of pages.entries()) {
  await page.goto(origin + '/admin/dashboard' + (p ? '/' + p : ''));
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${String(i + 1).padStart(2, '0')}-${p || 'overview'}.png`, fullPage: process.env.FULL === '1' });
}
if (process.env.SWIPE) {
  await page.goto(origin + '/admin/dashboard'); await page.waitForTimeout(900);
  const touch = async (type, x, y) => page.evaluate(([type, x, y]) => { const t = new Touch({ identifier: 1, target: document.body, clientX: x, clientY: y }); document.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true })); }, [type, x, y]);
  await touch('touchstart', 8, 400); await touch('touchend', 220, 410); await page.waitForTimeout(400);
  console.log('open after edge swipe:', await page.locator('.mk-sidebar').evaluate(e => e.classList.contains('is-open')));
  await page.screenshot({ path: `${out}/swipe-open.png` });
  await touch('touchstart', 220, 400); await touch('touchend', 40, 405); await page.waitForTimeout(400);
  console.log('open after swipe left:', await page.locator('.mk-sidebar').evaluate(e => e.classList.contains('is-open')));
  await touch('touchstart', 200, 400); await touch('touchend', 380, 405); await page.waitForTimeout(300);
  console.log('open after mid-screen swipe (should stay closed):', await page.locator('.mk-sidebar').evaluate(e => e.classList.contains('is-open')));
}
if (process.env.AI_GEMINI) {
  await page.goto(origin + '/admin/dashboard/ai'); await page.waitForTimeout(900);
  await page.getByRole('button', { name: /Cài đặt AI/ }).first().click().catch(() => {});
  await page.locator('input[type=password]').fill('  "sk-or-v1-0123456789abcdef0123456789abcdef"\n');
  const save = page.getByRole('button', { name: 'Lưu và kiểm tra' });
  console.log('save enabled:', await save.isEnabled());
  await save.click(); await page.waitForTimeout(1200);
  await asUser(); console.log('stored:', JSON.stringify((await db.query("select public.maoki_ai_settings('status','{}') as r")).rows[0].r));
  await page.screenshot({ path: `${out}/ai-saved.png`, fullPage: true });
}
if (process.env.WIZARD) {
  await page.goto(origin + '/admin/dashboard/channels'); await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Kết nối' }).first().click(); await page.locator('select').last().selectOption({ index: 1 });
  await page.getByRole('button', { name: /Tiếp tục/ }).click(); await page.locator('input[type=url]').fill('https://www.airbnb.com/calendar/ical/123.ics?s=demo');
  await page.screenshot({ path: `${out}/wizard-2.png` });
  await page.getByRole('button', { name: /Kết nối và đồng bộ/ }).click(); await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/wizard-3.png` });
  await page.getByRole('button', { name: 'Xong' }).click(); await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/channels-connected.png` });
}
console.log('manifest:', await page.evaluate(() => document.getElementById('app-manifest')?.getAttribute('href')));
console.log('errors:', JSON.stringify(errors));
await browser.close(); await db.close();
