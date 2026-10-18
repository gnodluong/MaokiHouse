// Exercises the real browser SDK and SQL migration together. Auth is stubbed;
// this is not a hosted Supabase authentication or deployment check.
import { PGlite } from '@electric-sql/pglite';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { readFile,readdir,mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite(); const uid='44444444-4444-4444-8444-444444444444'; const email='primary@example.test';
const output=process.env.TEST_ARTIFACT_DIR || '/tmp/maoki-primary-browser'; await mkdir(output,{recursive:true});
await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz); grant usage on schema auth to anon,authenticated;
create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
insert into auth.users values('${uid}','${email}',now());`);
for(const file of (await readdir('supabase/migrations')).filter(x=>x.endsWith('.sql')).sort()) await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
const user={id:uid,email,aud:'authenticated',role:'authenticated',email_confirmed_at:new Date().toISOString(),created_at:new Date().toISOString(),app_metadata:{provider:'email'},user_metadata:{}};
const token=[{alg:'HS256',typ:'JWT'},{sub:uid,email,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600},'stub-signature'].map((x,i)=>i<2?Buffer.from(JSON.stringify(x)).toString('base64url'):x).join('.');
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
let queue=Promise.resolve(); const failures=[]; let checks=0;
const pass=msg=>{checks++;console.log('PASS',msg);};
const primary=await browser.newContext({viewport:{width:1440,height:1000}});
async function wire(context) {
 await context.route('https://*.supabase.co/**',async route=>{
  const request=route.request(); const url=new URL(request.url()); const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','Content-Type':'application/json'};
  if(request.method()==='OPTIONS') return route.fulfill({status:204,headers});
  if(url.pathname==='/auth/v1/token') return route.fulfill({status:200,headers,body:JSON.stringify({access_token:token,refresh_token:'test-refresh',expires_in:3600,token_type:'bearer',user})});
  if(url.pathname==='/auth/v1/user') return route.fulfill({status:200,headers,body:JSON.stringify(user)});
  if(url.pathname==='/auth/v1/logout') return route.fulfill({status:204,headers});
  if(url.pathname.startsWith('/rest/v1/rpc/')) {
   const job=async()=>{
    try {
     const body=request.postDataJSON(); const name=url.pathname.split('/').at(-1); const authenticated=request.headers().authorization==='Bearer '+token;
     await db.exec('reset role'); await db.query("select set_config('request.jwt.claims',$1,false)",[authenticated?JSON.stringify({sub:uid,email,is_anonymous:false}):'{}']); await db.exec(authenticated?'set role authenticated':'set role anon');
     const values=name==='maoki_workspace'?[body.op,body.kind||'',body.record_id||null,JSON.stringify(body.payload||{})]:[body.op,body.record_id||null,body.token||'',JSON.stringify(body.payload||{})];
     if(!['maoki_workspace','maoki_public'].includes(name)) throw new Error('Unexpected RPC');
     const result=(await db.query(`select public.${name}($1,$2,$3,$4) as result`,values)).rows[0].result;
     await route.fulfill({status:200,headers,body:JSON.stringify(result)});
    } catch(error) { failures.push(error.message); await route.fulfill({status:400,headers,body:JSON.stringify({message:error.message,code:error.code||'TEST'})}); }
   }; const pending=queue.then(job); queue=pending.catch(()=>{}); return pending;
  }
  return route.fulfill({status:404,headers,body:'{"message":"Unexpected test endpoint"}'});
 });
}
try {
 await wire(primary); const page=await primary.newPage(); const exceptions=[]; page.on('pageerror',e=>exceptions.push(e.message)); const origin=process.env.TEST_WEB_ORIGIN || 'http://127.0.0.1:5173';
 const audit=async(name)=>{ const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze(); await writeFile(output+'/axe-'+name+'.json',JSON.stringify(result.violations,null,2)); assert.deepEqual(result.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],'accessibility '+name); pass(name+' accessibility scan'); };
 await page.goto(origin+'/admin'); await audit('login'); await page.getByLabel('Email',{exact:true}).fill(email); await page.getByLabel('Mật khẩu',{exact:true}).fill('local-test-only'); await page.getByRole('button',{name:'Đăng nhập',exact:true}).click(); await page.waitForURL('**/admin/dashboard'); await page.locator('.mk-stats-grid').waitFor(); assert.equal(await page.locator('.mk-demo-badge').count(),0); pass('Supabase SDK sign-in flow opens primary workspace (stubbed Auth)'); await audit('overview');
 await page.getByRole('link',{name:'Phòng & căn hộ',exact:true}).click(); await page.getByRole('button',{name:'Thêm phòng',exact:true}).first().click(); await page.getByRole('dialog').waitFor(); await audit('editor');
 const original=await page.evaluate(()=>document.activeElement.id); await page.keyboard.press('Shift+Tab'); assert.equal(await page.getByRole('dialog').evaluate(x=>x.contains(document.activeElement)),true); await page.keyboard.press('Tab'); assert.equal(await page.evaluate(()=>document.activeElement.id),original); pass('editor keyboard focus remains inside dialog');
 await page.locator('#field-title').fill('Supabase Browser Stay'); await page.locator('#field-basePrice').fill('1250000'); await page.locator('#field-imageURLs').fill('/rooms/maoki-2.jpg'); await page.locator('#field-published').check(); await page.getByRole('button',{name:'Tạo phòng',exact:true}).click(); await page.getByRole('dialog').waitFor({state:'hidden'}); await page.getByRole('heading',{name:'Supabase Browser Stay'}).waitFor(); pass('primary adapter saves property through SDK RPC into PostgreSQL');
 await page.getByRole('link',{name:'Cài đặt',exact:true}).click(); await page.getByLabel('Mở kênh trò chuyện').check(); await page.getByRole('button',{name:'Lưu cài đặt',exact:true}).click(); await page.getByText('Đã lưu cài đặt',{exact:true}).waitFor(); const chatLink=await page.getByRole('link',{name:'Xem cửa sổ chat'}).getAttribute('href'); assert.equal(chatLink.includes('demo'),false); await page.getByRole('cell',{name:email,exact:false}).waitFor(); pass('settings and team list use primary Supabase adapter');
 const visitors=await browser.newContext(); await wire(visitors); const visitor=await visitors.newPage(); await visitor.goto(origin+chatLink); await visitor.getByLabel('Bạn tên là gì?').fill('Supabase Visitor'); await visitor.getByRole('textbox',{name:'Tin nhắn của bạn'}).fill('Primary hello'); await visitor.getByRole('button',{name:'Gửi lời nhắn'}).click(); await visitor.getByText('Primary hello',{exact:true}).waitFor();
 await page.getByRole('link',{name:/^Hộp thư hợp nhất/}).click(); await page.getByRole('button',{name:/Supabase Visitor/}).click(); await page.getByRole('textbox',{name:'Nội dung phản hồi'}).fill('Primary reply'); await page.getByRole('button',{name:'Gửi phản hồi',exact:true}).click(); await visitor.getByText('Primary reply',{exact:true}).waitFor({timeout:12000}); pass('primary public and staff adapters exchange actual PostgreSQL messages'); await audit('inbox');
 await page.screenshot({path:output+'/supabase-inbox-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844}); if (!(await page.locator('.mk-chat-pane').isVisible())) await page.getByRole('button',{name:/Supabase Visitor/}).click(); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true); await audit('inbox-mobile'); await page.screenshot({path:output+'/supabase-inbox-mobile.png',fullPage:true});
 await visitor.goto(origin+'/'); await visitor.getByRole('heading',{name:'Supabase Browser Stay'}).waitFor(); pass('public website reads published Supabase properties');
 await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'}); await audit('inbox-mobile-dark'); await page.screenshot({path:output+'/supabase-inbox-mobile-dark.png',fullPage:true}); pass('dark theme and reduced motion render');
 assert.deepEqual(failures,[]); assert.deepEqual(exceptions,[]); pass('no SDK RPC failures or browser exceptions'); console.log(`${checks} primary adapter and accessibility checks passed; hosted authentication remains untested`); await visitors.close();
} finally {await browser.close(); await queue; await db.close();}
