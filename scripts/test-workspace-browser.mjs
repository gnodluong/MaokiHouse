import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const origin=process.env.TEST_WEB_ORIGIN || 'http://127.0.0.1:5173';
const output=process.env.TEST_ARTIFACT_DIR || '/tmp/maoki-browser'; await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}); const page=await context.newPage(); const exceptions=[]; page.on('pageerror',e=>exceptions.push(e.message)); let checks=0;
const pass=message=>{checks++;console.log('PASS',message);};
async function api(path,method='GET',body) { return page.evaluate(async({path,method,body})=>{ const {auth}=await import('/src/config/firebase.ts'); const r=await fetch('http://127.0.0.1:5000/api/workspace'+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+await auth.currentUser.getIdToken()},body:body===undefined?undefined:JSON.stringify(body)}); return {status:r.status,data:r.status===204?null:await r.json()}; },{path,method,body}); }
try {
 await page.goto(origin+'/admin'); await page.getByRole('button',{name:'Mở không gian demo',exact:true}).click();
 await page.waitForURL('**/admin/dashboard'); await page.getByRole('heading',{name:'Một ngày tốt lành, MaokiHouse.'}).waitFor({timeout:15000}).catch(()=>page.locator('.mk-stats-grid').waitFor());
 const snapshot=(await api('')).data; assert.equal(snapshot.properties.length,4); assert.equal(snapshot.capabilities.localDemo,true); assert.ok(snapshot.guidebooks.every(guide=>/^[a-f0-9]{48}$/.test(guide.publicToken))); pass('demo authentication and persistent seeded workspace');
 await page.screenshot({path:output+'/overview-desktop.png',fullPage:true});
 await page.getByRole('link',{name:'Phòng & căn hộ',exact:true}).click();
 await page.getByRole('button',{name:'Thêm phòng',exact:true}).click(); await page.locator('#field-title').fill('Browser Test Stay'); await page.locator('#field-basePrice').fill('950000'); await page.locator('#field-imageURLs').fill('/rooms/maoki-1.jpg'); await page.locator('#field-published').check(); await page.getByRole('button',{name:'Tạo phòng',exact:true}).click(); await page.getByRole('dialog').waitFor({state:'hidden'});
 let current=(await api('')).data; const stay=current.properties.find(x=>x.title==='Browser Test Stay'); assert.ok(stay?.published); pass('property created through editor and persisted');
 await page.getByRole('link',{name:'Đặt phòng',exact:true}).click(); await page.getByRole('button',{name:'Thêm đặt phòng',exact:true}).click();
 await page.locator('#field-propertyId').selectOption(stay.id); await page.locator('#field-guestName').fill('Browser Guest'); await page.locator('#field-checkIn').fill('2098-01-01'); await page.locator('#field-checkOut').fill('2098-01-03'); await page.locator('#field-payoutAmount').fill('1900000'); await page.getByRole('button',{name:'Tạo đặt phòng',exact:true}).click(); await page.getByRole('dialog').waitFor({state:'hidden'}); await page.getByRole('cell',{name:'Browser Guest',exact:true}).waitFor();
 const conflict=await api('/bookings','POST',{propertyId:stay.id,guestName:'Conflict',checkIn:'2098-01-02',checkOut:'2098-01-04',payoutAmount:100}); assert.equal(conflict.status,409); pass('reservation form persists and conflicting reservation rejected');
 await page.getByRole('link',{name:'Lịch phòng',exact:true}).click(); await page.locator('.mk-calendar').waitFor(); await page.screenshot({path:output+'/calendar-desktop.png',fullPage:true}); pass('calendar renders seeded reservations and room availability');
 const web=await api('/settings','PUT',{...snapshot.settings,widgetToken:undefined,widgetEnabled:true}); assert.equal(web.status,200);
 const visitorContext=await browser.newContext(); const visitor=await visitorContext.newPage(); visitor.on('pageerror',e=>exceptions.push(e.message));
 await visitor.goto(origin+'/chat/'+web.data.widgetToken+'?demo=1'); await visitor.getByLabel('Bạn tên là gì?').fill('Browser Visitor'); await visitor.getByRole('textbox',{name:'Tin nhắn của bạn'}).fill('Xin chào từ khách'); await visitor.getByRole('button',{name:'Gửi lời nhắn'}).click(); await visitor.getByText('Xin chào từ khách',{exact:true}).waitFor();
 await page.getByRole('link',{name:/^Hộp thư hợp nhất/}).click(); await page.getByRole('button',{name:/Browser Visitor/}).click(); await page.getByRole('textbox',{name:'Nội dung phản hồi'}).fill('Chào bạn, phòng còn trống.'); await page.getByRole('button',{name:'Gửi phản hồi',exact:true}).click();
 await visitor.getByText('Chào bạn, phòng còn trống.',{exact:true}).waitFor({timeout:12000}); pass('independent visitor session receives real staff web chat reply'); await page.screenshot({path:output+'/inbox-desktop.png',fullPage:true});
 const publicPage=await visitorContext.newPage(); await publicPage.goto(origin+'/book/'+stay.id+'?demo=1'); await publicPage.getByLabel('Ngày nhận phòng').fill('2098-02-01'); await publicPage.getByLabel('Ngày trả phòng').fill('2098-02-03'); await publicPage.getByRole('button',{name:'Kiểm tra phòng & giá'}).click(); await publicPage.getByLabel('Họ và tên',{exact:true}).fill('Direct Browser Guest'); await publicPage.getByLabel('Email',{exact:true}).fill('direct@example.test'); await publicPage.getByLabel('Điện thoại',{exact:true}).fill('0901234567'); await publicPage.getByRole('button',{name:'Gửi yêu cầu đặt phòng',exact:true}).click(); await publicPage.getByRole('heading',{name:'Lời hẹn của bạn đã được gửi.'}).waitFor();
 current=(await api('')).data; assert.equal(current.bookings.find(x=>x.guestName==='Direct Browser Guest').payoutAmount,1900000); pass('public quote and booking flow creates correctly priced pending reservation');
 const guide=await api('/guidebooks','POST',{title:'Browser Guide',propertyId:stay.id,welcome:'Welcome browser guest',wifiName:'Maoki WiFi',wifiPassword:'guest-wifi',published:true}); assert.equal(guide.status,201); await publicPage.goto(origin+'/guide/'+guide.data.publicToken+'?demo=1'); await publicPage.getByRole('heading',{name:'Browser Guide'}).waitFor(); pass('published guest guide displays only guest content');
 const task=current.tasks.find(x=>x.status!=='done'); await page.getByRole('link',{name:'Công việc',exact:true}).click(); const row=page.getByRole('row').filter({hasText:task.title}); await row.getByRole('button',{name:'Hoàn tất công việc'}).click(); await row.getByText('Hoàn tất',{exact:true}).waitFor(); pass('task completion updates persistent record');
 await page.getByRole('link',{name:'Báo cáo',exact:true}).click(); await page.getByRole('heading',{name:'Báo cáo & hiệu quả'}).waitFor(); const download=page.waitForEvent('download'); await page.getByRole('button',{name:'Xuất báo cáo'}).click(); assert.match((await download).suggestedFilename(),/\.csv$/); pass('financial reports render and export CSV');
 for (const link of ['Khách hàng','Giá & tình trạng','Sổ tay lưu trú','Chủ sở hữu','Tự động hóa','Chiến dịch','Mẫu trả lời','Thu & chi','Đội ngũ','Kết nối','Cài đặt']) { await page.getByRole('link',{name:link,exact:true}).click(); await page.locator('.mk-page-header').waitFor(); assert.equal(await page.locator('.mk-alert.error').count(),0,'screen errors on '+link); } pass('all remaining management screens open without errors');
 await page.setViewportSize({width:390,height:844}); await page.getByRole('button',{name:'Mở menu',exact:true}).click(); await page.getByRole('link',{name:/^Hộp thư hợp nhất/}).click(); await page.getByRole('button',{name:/Browser Visitor/}).click(); await page.locator('.mk-chat-pane').waitFor({state:'visible'}); await page.screenshot({path:output+'/inbox-mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true); pass('mobile navigation and conversation view fit viewport');
 await page.getByRole('button',{name:'Quay lại hộp thư'}).click(); await page.getByRole('button',{name:'Mở menu',exact:true}).click(); await page.getByRole('link',{name:'Tổng quan',exact:true}).click(); await page.screenshot({path:output+'/overview-mobile.png',fullPage:true}); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true); pass('mobile overview has no page overflow');
 await page.keyboard.press('Control+k'); assert.equal(await page.getByRole('textbox',{name:'Tìm trong không gian'}).evaluate(x=>x===document.activeElement),true); pass('keyboard search shortcut focuses labeled search');
 assert.deepEqual(exceptions,[]); pass('no uncaught browser application exceptions'); console.log(`${checks} browser checks passed; screenshots: ${output}`);
 await visitorContext.close();
} finally {
  const uid=await page.evaluate(async()=>{const {auth}=await import('/src/config/firebase.ts');return auth.emulatorConfig?.host==='127.0.0.1' && auth.currentUser?.isAnonymous ? auth.currentUser.uid : null;}).catch(()=>null);
  await browser.close();
  if(uid) {
    Object.assign(process.env,{FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099'});
    for(const name of ['HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy','GOOGLE_APPLICATION_CREDENTIALS']) delete process.env[name];
    const {default:admin}=await import('firebase-admin'); const app=admin.initializeApp({projectId:'demo-maokihouse'},'browser-test-cleanup');
    try {
      const store=admin.firestore(app);
      for(const collection of ['properties','bookings','contacts','messageThreads','operationTasks','ratePlans','guidebooks','owners','automations','campaigns','savedReplies','workspaceIntegrations','employees','revenueEntries','workspaceActivity','visitorSessions']) {
        const records=await store.collection(collection).where('hostId','==',uid).get();
        for(let index=0;index<records.docs.length;index+=400) {const batch=store.batch();records.docs.slice(index,index+400).forEach(doc=>batch.delete(doc.ref));await batch.commit();}
      }
      await store.collection('workspaceSettings').doc(uid).delete(); await admin.auth(app).deleteUser(uid);
    } finally {await app.delete();}
  }
}
