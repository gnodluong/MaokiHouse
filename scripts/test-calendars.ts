import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import ICAL from 'ical.js';
import { calendarURL, parseCalendar, fetchCalendar } from '../api/_lib/calendars';
import { handleChannels } from '../api/_lib/channelApi';

let checks=0; const pass=(name:string)=>{checks++;console.log('PASS',name);};
const day=(offset:number)=>new Date(Date.now()+offset*86400000).toISOString().slice(0,10);
const event=(uid:string,from=day(2),to=day(4))=>`BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTART;VALUE=DATE:${from.replaceAll('-','')}\r\nDTEND;VALUE=DATE:${to.replaceAll('-','')}\r\nSUMMARY:Private guest data\r\nEND:VEVENT\r\n`;
const calendar=(body:string)=>`BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}END:VCALENDAR\r\n`;
const validURL='https://www.airbnb.com/calendar/ical/123.ics?s=private-test-feed';
for(const url of ['http://www.airbnb.com/calendar/ical/123.ics','https://127.0.0.1/a.ics','https://www.airbnb.com.attacker.test/calendar/ical/a.ics','https://x:pass@www.airbnb.com/calendar/ical/123.ics','https://admin.booking.com/other','https://[::1]/calendar.ics']) assert.throws(()=>calendarURL(url,url.includes('booking')?'booking':'airbnb'));
assert.equal(calendarURL(validURL,'airbnb').hostname,'www.airbnb.com');pass('calendar fetch permits only official HTTPS hosts and calendar paths');
assert.deepEqual(parseCalendar(calendar(event('first'))),[{uid:'first',checkIn:day(2),checkOut:day(4)}]);
assert.equal(parseCalendar(calendar(event('maoki-self@maokihouse')+event('cancelled').replace('SUMMARY:','STATUS:CANCELLED\r\nSUMMARY:'))).length,0);pass('all-day checkout is exclusive, cancelled and echoed Maoki events are ignored');
for(const body of [calendar(event('duplicate')+event('duplicate')),calendar(event('bad','2026-02-30','2026-03-02')),calendar(event('recurring').replace('SUMMARY:','RRULE:FREQ=DAILY\r\nSUMMARY:')),calendar(event('time').replace('DTSTART;VALUE=DATE:','DTSTART:').replace('DTEND;VALUE=DATE:','DTEND:')),calendar(event('backwards',day(4),day(2))),'<html>Sign in</html>']) assert.throws(()=>parseCalendar(body));
pass('malformed, recurring, duplicate, timed and invalid-date feeds fail closed');
let redirectMode='';await assert.rejects(()=>fetchCalendar(validURL,'airbnb',async(_url,options)=>{redirectMode=String(options?.redirect);return new Response('',{status:302,headers:{location:'http://127.0.0.1/'}});}));assert.equal(redirectMode,'manual');
await assert.rejects(()=>fetchCalendar(validURL,'airbnb',async()=>new Response('large',{headers:{'content-length':'2000001'}})));pass('redirects and oversized remote calendars are refused');
let trustedHops=0;const redirected=await fetchCalendar('https://admin.booking.com/hotel/hoteladmin/ical.html?t=test-only','booking',async()=>{trustedHops++;return trustedHops===1?new Response('',{status:302,headers:{location:'https://ical.booking.com/v1/export?t=test-only'}}):new Response(calendar(event('booking-redirect')));});assert.equal(trustedHops,2);assert.equal(redirected[0].uid,'booking-redirect');pass('redirects within the same approved provider are supported without widening host access');

const db=new PGlite();const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',agent='33333333-3333-4333-8333-333333333333';
await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);grant usage on schema auth to anon,authenticated;
create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
insert into auth.users values('${owner}','owner@example.test',now()),('${other}','other@example.test',now()),('${agent}','agent@example.test',now());`);
for(const file of (await readdir('supabase/migrations')).filter(name=>name.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
async function login(uid:string|null){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(uid?{sub:uid,email:uid===owner?'owner@example.test':uid===other?'other@example.test':'agent@example.test',is_anonymous:false}:{})]);await db.exec(uid?'set role authenticated':'set role anon');}
async function rpc(name:string,args:unknown[]){return (await db.query<{result:unknown}>(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args)).rows[0].result as never;}
const workspace=async(op:string,kind='',id:string|null=null,payload:unknown={})=>rpc('maoki_workspace',[op,kind,id,JSON.stringify(payload)]);
const channels=async(op:string,id:string|null=null,payload:unknown={})=>rpc('maoki_channels',[op,id,JSON.stringify(payload)]);
let remote=calendar(event('airbnb-one'));let remoteCalls=0;let identity=owner;
const transport:typeof fetch=async(input,options)=>{
 const url=String(input);
 if(url.startsWith('https://www.airbnb.com/calendar/ical/')||url.startsWith('https://admin.booking.com/hotel/hoteladmin/ical.html')){remoteCalls++;return new Response(remote,{headers:{'content-type':'text/calendar'}});}
 if(url.includes('/auth/v1/user'))return Response.json({id:identity,email:'owner@example.test',is_anonymous:false});
 if(url.includes('/rest/v1/rpc/')){
  const body=JSON.parse(String(options?.body));const name=new URL(url).pathname.split('/').at(-1)!;
  await login(name==='maoki_calendar_feed'?null:identity);
  try{return Response.json(await rpc(name,name==='maoki_channels'?[body.op,body.connection_id||null,JSON.stringify(body.payload||{})]:[body.feed_token]));}
  catch(error){return Response.json({message:error instanceof Error?error.message:'DB error',code:(error as {code?:string}).code||'P0001'},{status:400});}
 }
 throw new Error('Unexpected test URL');
};
const request=(body?:unknown,feed?:string,auth=true)=>new Request('https://maoki.test/api/channels'+(feed?'?feed='+feed:''),{method:body?'POST':'GET',headers:auth?{Authorization:'Bearer test-token'}:{},...(body?{body:JSON.stringify(body)}:{})});
const api=async(body?:unknown)=>{const response=await handleChannels(request(body),{},transport);return{status:response.status,...await response.json()};};
try{
 await login(owner);const initial=await workspace('snapshot') as {workspaceId:string};const stay=await workspace('save','properties',null,{title:'Calendar Stay',basePrice:750000,published:true}) as {id:string};
 assert.equal((await handleChannels(request(undefined,undefined,false),{},transport)).status,401);pass('private channel endpoints require authentication');
 let result=await api({action:'connect',platform:'airbnb',propertyId:stay.id,url:validURL});assert.equal(result.synced,true);assert.equal(result.blockCount,1);const connection=result.id as string;pass('web connect fetches and persists actual all-day blocks through checked SQL');
 const list=await api();const token=list.connections[0].exportToken as string;assert.ok(!JSON.stringify(list).includes('private-test-feed'));assert.ok(!JSON.stringify(list).includes('Private guest'));pass('connection list excludes source URLs and guest data');
 await login(owner);const snapshot=await workspace('snapshot') as {bookings:unknown[];revenue:unknown[]};assert.equal(snapshot.bookings.length,0);assert.equal(snapshot.revenue.length,0);assert.equal((await channels('busy') as unknown[]).length,1);pass('imported busy dates do not become bookings or revenue');
 await assert.rejects(()=>workspace('save','bookings',null,{propertyId:stay.id,guestName:'Collision',checkIn:day(2),checkOut:day(3)}),/iCal/);await login(null);await assert.rejects(()=>rpc('maoki_public',['quote',stay.id,'',JSON.stringify({checkIn:day(2),checkOut:day(3)})]),/iCal/);pass('both staff booking and public quote reject imported busy dates');
 await assert.rejects(()=>db.query('select * from maoki_private.channel_calendars'));await assert.rejects(()=>channels('list'));pass('anonymous callers cannot read calendar credentials or administration RPC');
 identity=other;await login(other);await workspace('snapshot');assert.equal((await api()).connections.length,0);const calls=remoteCalls;assert.equal((await api({action:'sync',id:connection})).status,400);assert.equal(remoteCalls,calls);assert.equal((await channels('busy') as unknown[]).length,0);pass('another workspace cannot read, sync or change the connection');identity=owner;
 await login(owner);const invite=await workspace('invite','',null,{email:'agent@example.test',role:'agent'}) as {token:string};await login(agent);await workspace('accept_invite','',null,{token:invite.token});await assert.rejects(()=>channels('list'),/Chỉ chủ/);assert.equal((await channels('busy') as unknown[]).length,1);pass('agents see availability but cannot obtain or manage connection secrets');
 remote=calendar(event('booking-one',day(6),day(7)));const linkedBooking=await api({action:'connect',platform:'booking',propertyId:stay.id,url:'https://admin.booking.com/hotel/hoteladmin/ical.html?t=booking-test-only'});assert.equal(linkedBooking.synced,true);const bookingList=await api();const bookingToken=bookingList.connections.find((item:{platform:string})=>item.platform==='booking').exportToken;const exportedToBooking=await handleChannels(request(undefined,bookingToken,false),{},transport);const bookingEvents=new ICAL.Component(ICAL.parse(await exportedToBooking.text())).getAllSubcomponents('vevent');assert.equal(bookingEvents.length,1);assert.equal(String(bookingEvents[0].getFirstPropertyValue('dtstart')).slice(0,10),day(2));pass('Airbnb and Booking connections remain separate and export other-channel availability');

 await login(owner);const claim=await channels('claim',connection) as {nonce:string};await assert.rejects(()=>channels('claim',connection),/đang đồng bộ/);await assert.rejects(()=>channels('finish',connection,{events:[]}),/hết hiệu lực/);await assert.rejects(()=>channels('finish',connection,{nonce:claim.nonce}),/không hợp lệ/);await channels('fail',connection,{nonce:claim.nonce});pass('sync lease and nonce prevent stale or malformed results from clearing availability');
 remote='<html>Temporary error</html>';result=await api({action:'sync',id:connection});assert.equal(result.status,400);await login(owner);assert.equal((await channels('busy') as unknown[]).length,2);pass('failed fetch/parse retains previous busy dates');
 remote=calendar(event('airbnb-one',day(3),day(5)));result=await api({action:'sync',id:connection});assert.equal(result.synced,true);await login(owner);assert.equal((await channels('busy') as {checkIn:string;platform:string}[]).find(item=>item.platform==='airbnb')!.checkIn,day(3));pass('sync updates an event without duplicate blocks');
 const booking=await workspace('save','bookings',null,{propertyId:stay.id,guestName:'PRIVATE REAL GUEST',checkIn:day(10),checkOut:day(11),status:'confirmed'}) as {id:string};
 const feed=await handleChannels(request(undefined,token,false),{},transport);assert.equal(feed.status,200);const text=await feed.text();assert.ok(text.includes('BEGIN:VCALENDAR'));assert.ok(!text.includes('PRIVATE REAL GUEST'));assert.ok(!text.includes('750000'));assert.ok(!text.includes('private-test-feed'));const outgoing=new ICAL.Component(ICAL.parse(text));assert.equal(outgoing.getAllSubcomponents('vevent').length,2);pass('public feed exports actual availability without guest names, rates or source secrets');
 remote=calendar(event('airbnb-one',day(10),day(11)));result=await api({action:'sync',id:connection});assert.equal(result.synced,true);assert.equal(result.conflictCount,1);await login(owner);assert.equal((await workspace('snapshot') as {bookings:{id:string}[]}).bookings[0].id,booking.id);pass('remote conflicts are reported while existing bookings are preserved');
 remote=calendar('');result=await api({action:'sync',id:connection});assert.equal(result.synced,true);await login(owner);assert.equal((await channels('busy') as unknown[]).length,1);assert.equal((await workspace('snapshot') as {bookings:unknown[]}).bookings.length,1);pass('remote cancellation removes only imported availability, not real bookings');
 result=await api({action:'disconnect',id:connection});assert.equal(result.disconnected,true);assert.equal((await handleChannels(request(undefined,token,false),{},transport)).status,404);await login(owner);assert.equal((await workspace('snapshot') as {bookings:unknown[]}).bookings.length,1);pass('disconnect revokes export URL and preserves real records');
 assert.equal(initial.workspaceId.length,36);console.log(`${checks} iCal parser, SSRF, tenant isolation, reconciliation and availability checks passed`);
}finally{await db.close();}
