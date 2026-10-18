// Exercises the real browser SDK and SQL migration together. Auth is stubbed;
// this is not a hosted Supabase authentication or deployment check.
import { PGlite } from '@electric-sql/pglite';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { readFile,readdir,mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { migrationPlan, channelMigrationPlan } from './supabase-project.mjs';
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
     const values=name==='maoki_workspace'?[body.op,body.kind||'',body.record_id||null,JSON.stringify(body.payload||{})]:name==='maoki_channels'?[body.op,body.connection_id||null,JSON.stringify(body.payload||{})]:name==='maoki_calendar_feed'?[body.feed_token||'']:[body.op,body.record_id||null,body.token||'',JSON.stringify(body.payload||{})];
     if(!['maoki_workspace','maoki_public','maoki_channels','maoki_calendar_feed'].includes(name)) throw new Error('Unexpected RPC');
     const result=(await db.query(`select public.${name}(${values.map((_,i)=>'$'+(i+1)).join(',')}) as result`,values)).rows[0].result;
     await route.fulfill({status:200,headers,body:JSON.stringify(result)});
    } catch(error) { failures.push(error.message); await route.fulfill({status:400,headers,body:JSON.stringify({message:error.message,code:error.code||'TEST'})}); }
   }; const pending=queue.then(job); queue=pending.catch(()=>{}); return pending;
  }
  return route.fulfill({status:404,headers,body:'{"message":"Unexpected test endpoint"}'});
 });
}
try {
 await wire(primary); const page=await primary.newPage(); const exceptions=[]; page.on('pageerror',e=>exceptions.push(e.message)); const origin=process.env.TEST_WEB_ORIGIN || 'http://127.0.0.1:5173';
 const audit=async(name)=>{ await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(animation=>animation.effect?.getTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{})));}); const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze(); await writeFile(output+'/axe-'+name+'.json',JSON.stringify(result.violations,null,2)); assert.deepEqual(result.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],'accessibility '+name); pass(name+' accessibility scan'); };
 await page.goto(origin+'/setup'); await page.getByRole('heading',{name:'Đưa MaokiHouse vào sử dụng.'}).waitFor();
 assert.equal(await page.getByLabel('SQL thiết lập MaokiHouse').inputValue(),(await migrationPlan()).query+'\n\n'+(await channelMigrationPlan()).query); await page.getByRole('button',{name:'Kiểm tra dữ liệu',exact:true}).click(); await page.getByRole('status').filter({hasText:'Đã kết nối được'}).waitFor(); pass('setup guide exports the exact guarded migration and checks the public RPC'); await audit('setup');
 await page.goto(origin+'/admin'); await audit('login');
 await page.locator('.mk-brand img').evaluate(img=>img.decode()); assert.equal(await page.locator('.mk-brand img').evaluate(img=>img.naturalWidth),1227); assert.equal((await page.locator('body').innerText()).toLowerCase().includes('hospitality workspace'),false); assert.equal(await page.title(),'MaokiHouse'); assert.equal(await page.getByRole('button',{name:'Đăng nhập',exact:true}).evaluate(button=>getComputedStyle(button).backgroundColor),'rgb(138, 74, 52)'); await page.screenshot({path:output+'/maoki-login.png',fullPage:true}); pass('original local Maoki wordmark and terracotta palette render'); await page.getByLabel('Email',{exact:true}).fill(email); await page.getByLabel('Mật khẩu',{exact:true}).fill('local-test-only'); await page.getByRole('button',{name:'Đăng nhập',exact:true}).click(); await page.waitForURL('**/admin/dashboard'); await page.locator('.mk-stats-grid').waitFor(); assert.equal(await page.locator('.mk-demo-badge').count(),0); pass('Supabase SDK sign-in flow opens primary workspace (stubbed Auth)'); await audit('overview');
 await page.getByRole('link',{name:'Phòng & căn hộ',exact:true}).click(); await page.getByRole('button',{name:'Thêm phòng',exact:true}).first().click(); await page.getByRole('dialog').waitFor(); await audit('editor');
 const original=await page.evaluate(()=>document.activeElement.id); await page.keyboard.press('Shift+Tab'); assert.equal(await page.getByRole('dialog').evaluate(x=>x.contains(document.activeElement)),true); await page.keyboard.press('Tab'); assert.equal(await page.evaluate(()=>document.activeElement.id),original); pass('editor keyboard focus remains inside dialog');
 await page.locator('#field-title').fill('Supabase Browser Stay'); await page.locator('#field-basePrice').fill('1250000'); await page.locator('#field-imageURLs').fill('/rooms/maoki-2.jpg'); await page.locator('#field-published').check(); await page.getByRole('button',{name:'Tạo phòng',exact:true}).click(); await page.getByRole('dialog').waitFor({state:'hidden'}); await page.getByRole('heading',{name:'Supabase Browser Stay'}).waitFor(); pass('primary adapter saves property through SDK RPC into PostgreSQL');

 const busyFrom=new Date(Date.now()+2*86400000).toISOString().slice(0,10),busyTo=new Date(Date.now()+4*86400000).toISOString().slice(0,10);
 await primary.route('**/api/channels**',async route=>{
  const job=async()=>{
   try{
    assert.equal(route.request().headers().authorization,'Bearer '+token);await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:uid,email,is_anonymous:false})]);await db.exec('set role authenticated');
    const call=async(op,id=null,payload={})=>(await db.query('select public.maoki_channels($1,$2,$3) as result',[op,id,JSON.stringify(payload)])).rows[0].result;
    const body=route.request().method()==='POST'?route.request().postDataJSON():null;let result;
    if(!body)result={connections:await call('list')};
    else if(body.action==='disconnect'){await call('disconnect',body.id);result={disconnected:true};}
    else{let id=body.id;if(body.action==='connect')id=(await call('save',null,body)).id;const claim=await call('claim',id);result={saved:true,...await call('finish',id,{nonce:claim.nonce,events:[{uid:'browser-calendar-event',checkIn:busyFrom,checkOut:busyTo}]})};}
    await route.fulfill({json:result});
   }catch(error){failures.push(error.message);await route.fulfill({status:400,json:{error:error.message}});}
  };const pending=queue.then(job);queue=pending.catch(()=>{});return pending;
 });
 await page.getByRole('link',{name:'Kết nối',exact:true}).click();await page.getByRole('heading',{name:'Kết nối',exact:true}).waitFor();await page.getByRole('button',{name:'Kết nối Airbnb',exact:true}).click();await page.getByRole('dialog').waitFor();await audit('connect-calendar');await page.getByLabel('Phòng / căn hộ',{exact:true}).selectOption({label:'Supabase Browser Stay'});await page.getByLabel('Liên kết xuất lịch iCal của Airbnb').fill('https://www.airbnb.com/calendar/ical/123.ics?s=test-only');await page.getByRole('button',{name:'Kết nối và đồng bộ',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await page.getByText('Airbnb · Supabase Browser Stay',{exact:true}).waitFor();assert.ok((await page.getByLabel('Liên kết lịch MaokiHouse để nhập vào Airbnb').inputValue()).includes('/api/channels?feed='));pass('channel wizard maps a property and stores private calendar connection with export URL');await audit('connections');await page.screenshot({path:output+'/connections-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await audit('connections-mobile');await page.screenshot({path:output+'/connections-mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('link',{name:'Lịch phòng',exact:true}).click();await page.getByRole('heading',{name:'Lịch phòng',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelectorAll('.mk-calendar-cell').length>0);const blocked=page.locator('.mk-calendar-cell').filter({hasText:'iCal'});await blocked.first().waitFor();assert.equal(await blocked.count(),2);assert.equal(await blocked.first().isDisabled(),true);pass('calendar displays imported busy days and prevents booking those cells');
 await page.getByRole('link',{name:'Cài đặt',exact:true}).click(); await page.getByLabel('Mở kênh trò chuyện').check(); await page.getByRole('button',{name:'Lưu cài đặt',exact:true}).click(); await page.getByText('Đã lưu cài đặt',{exact:true}).waitFor(); const chatLink=await page.getByRole('link',{name:'Xem cửa sổ chat'}).getAttribute('href'); assert.equal(chatLink.includes('demo'),false); await page.getByRole('cell',{name:email,exact:false}).waitFor(); pass('settings and team list use primary Supabase adapter');
 const visitors=await browser.newContext(); await wire(visitors); const visitor=await visitors.newPage(); await visitor.goto(origin+chatLink); await visitor.getByLabel('Bạn tên là gì?').fill('Supabase Visitor'); await visitor.getByRole('textbox',{name:'Tin nhắn của bạn'}).fill('Primary hello'); await visitor.getByRole('button',{name:'Gửi lời nhắn'}).click(); await visitor.getByText('Primary hello',{exact:true}).waitFor();
 await page.getByRole('link',{name:/^Hộp thư hợp nhất/}).click(); await page.getByRole('button',{name:/Supabase Visitor/}).click(); await page.getByRole('textbox',{name:'Nội dung phản hồi'}).fill('Primary reply'); await page.getByRole('button',{name:'Gửi phản hồi',exact:true}).click(); await visitor.getByText('Primary reply',{exact:true}).waitFor({timeout:12000}); pass('primary public and staff adapters exchange actual PostgreSQL messages'); await audit('inbox');
 let aiConfigured=false; let aiBroken=true; const aiBodies=[];
 await primary.route('**/api/assistant',async route=>{ const req=route.request(); assert.equal(req.headers().authorization,'Bearer '+token); if(aiBroken) return route.fulfill({status:500,contentType:'text/plain',body:'FUNCTION_INVOCATION_FAILED'}); if(req.method()==='GET') return route.fulfill({json:{configured:aiConfigured,provider:'Gemini'}}); aiBodies.push(req.postDataJSON()); return route.fulfill({json:{reply:'Chào bạn, Maoki sẽ kiểm tra giờ trả phòng và phản hồi sớm.'}}); });
 await page.getByRole('link',{name:'Trợ lý AI',exact:true}).click(); await page.getByRole('alert').filter({hasText:'API trợ lý chưa hoạt động (HTTP 500)'}).waitFor(); pass('function startup failures display deployment guidance and an HTTP status'); aiBroken=false; await page.getByRole('link',{name:/^Hộp thư hợp nhất/}).click(); await page.getByRole('link',{name:'Trợ lý AI',exact:true}).click(); await page.getByText('Trợ lý đã có trong ứng dụng.',{exact:false}).waitFor(); assert.equal(await page.getByRole('button',{name:'Gửi câu hỏi'}).isEnabled(),false); pass('missing Gemini key shows a setup path instead of a simulated answer');
 aiConfigured=true; await page.getByRole('link',{name:/^Hộp thư hợp nhất/}).click(); await page.getByRole('link',{name:'Nhờ AI soạn phản hồi'}).click(); await page.getByLabel('Câu hỏi cho trợ lý').waitFor(); await page.waitForFunction(()=>!document.querySelector('#ai-question').disabled); assert.ok((await page.getByLabel('Câu hỏi cho trợ lý').inputValue()).includes('Primary hello')); assert.equal(aiBodies.length,0); pass('inbox AI shortcut prepares a draft without sending automatically');
 await page.getByLabel('Câu hỏi cho trợ lý').fill('Soạn lời chào cho khách'); await page.getByRole('button',{name:'Gửi câu hỏi'}).click(); await page.getByText('Chào bạn, Maoki sẽ kiểm tra giờ trả phòng và phản hồi sớm.',{exact:true}).waitFor(); assert.equal(aiBodies[0].includeContext,false); await audit('assistant'); await page.screenshot({path:output+'/maoki-assistant.png',fullPage:true});
 await page.getByLabel('Dùng số liệu vận hành của không gian hiện tại').check(); await page.getByLabel('Câu hỏi cho trợ lý').fill('Tóm tắt vận hành'); await page.getByRole('button',{name:'Gửi câu hỏi'}).click(); await page.getByRole('button',{name:'Sao chép câu trả lời',exact:true}).waitFor(); assert.equal(aiBodies[1].includeContext,true); assert.equal(aiBodies[1].history.length,3); pass('assistant conversation preserves turns and sends operating context only after opt-in');
 await page.setViewportSize({width:390,height:844}); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true); await audit('assistant-mobile'); await page.screenshot({path:output+'/maoki-assistant-mobile.png',fullPage:true}); await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'}); await audit('assistant-mobile-dark'); await page.emulateMedia({colorScheme:'light'}); await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('link',{name:/^Hộp thư hợp nhất/}).click(); await page.getByRole('button',{name:/Supabase Visitor/}).click();
 await page.screenshot({path:output+'/supabase-inbox-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844}); if (!(await page.locator('.mk-chat-pane').isVisible())) await page.getByRole('button',{name:/Supabase Visitor/}).click(); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true); await audit('inbox-mobile'); await page.screenshot({path:output+'/supabase-inbox-mobile.png',fullPage:true});
 await visitor.goto(origin+'/'); await visitor.getByRole('heading',{name:'Supabase Browser Stay'}).waitFor(); pass('public website reads published Supabase properties');
 await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'}); await audit('inbox-mobile-dark'); await page.screenshot({path:output+'/supabase-inbox-mobile-dark.png',fullPage:true}); assert.equal(await page.locator('.mk-page-header').evaluate(element=>getComputedStyle(element).animationName),'none');pass('dark theme and reduced motion render');
 assert.deepEqual(failures,[]); assert.deepEqual(exceptions,[]); pass('no SDK RPC failures or browser exceptions'); console.log(`${checks} primary adapter and accessibility checks passed; hosted authentication remains untested`); await visitors.close();
} finally {await browser.close(); await queue; await db.close();}
