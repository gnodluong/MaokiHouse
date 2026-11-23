-- Call center (call log fed by a telephony webhook) and Google Business Profile reviews.
alter table maoki_private.channel_accounts drop constraint if exists channel_accounts_platform_check;
alter table maoki_private.channel_accounts add constraint channel_accounts_platform_check check(platform in ('zalo','email','facebook','instagram','whatsapp','tiktok','phone','google'));
alter table public.maoki_records drop constraint if exists maoki_records_resource_check;
alter table public.maoki_records add constraint maoki_records_resource_check check(resource in (
  'properties','bookings','contacts','conversations','tasks','rates','guidebooks','owners','automations','campaigns','replies','integrations','employees','revenue',
  'tags','rules','hours','reminders','ticketTypes','tickets','bots','journeys','customFields','fieldValues','popups','products','orders','webhooks','agentGroups','knowledge','calls','reviews'));

-- Call log entries from a telephony provider webhook (create or update by call id).
create function maoki_private.channel_call(a maoki_private.channel_accounts, payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare dir text; counterpart text; digits text; who text; call_id text; existing public.maoki_records; d jsonb; st text; secs integer; started text;
begin
 dir:=case when payload->>'direction' in ('inbound','outbound') then payload->>'direction' else 'inbound' end;
 counterpart:=left(trim(coalesce(case when dir='inbound' then payload->>'from' else payload->>'to' end,'')),40);
 if counterpart='' then return jsonb_build_object('ok',true,'ignored',true); end if;
 call_id:=left(coalesce(payload->>'callId',''),120);
 st:=case when payload->>'status' in ('answered','missed','busy','failed','voicemail') then payload->>'status' else 'answered' end;
 secs:=least(86400,greatest(0,coalesce(nullif(payload->>'durationSec','')::numeric,0)))::integer;
 started:=case when coalesce(payload->>'startedAt','') ~ '^\d{4}-\d{2}-\d{2}T' then payload->>'startedAt' else to_char(clock_timestamp() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"') end;
 digits:=regexp_replace(counterpart,'\D','','g');
 if length(digits)>=7 then
   select c.data->>'name' into who from public.maoki_records c where c.workspace_id=a.workspace_id and c.resource='contacts' and regexp_replace(coalesce(c.data->>'phone',''),'\D','','g')<>'' and right(regexp_replace(c.data->>'phone','\D','','g'),9)=right(digits,9) limit 1;
 end if;
 if call_id<>'' then select * into existing from public.maoki_records where workspace_id=a.workspace_id and resource='calls' and data->>'callId'=call_id limit 1; end if;
 if existing.id is not null then
   update public.maoki_records set data=existing.data || jsonb_build_object('status',st,'durationSec',secs) || case when coalesce(payload->>'recordingUrl','') ~ '^https://[^\s/]+' then jsonb_build_object('recordingUrl',payload->>'recordingUrl') else '{}'::jsonb end,updated_at=clock_timestamp() where id=existing.id;
   return jsonb_build_object('ok',true,'updated',true);
 end if;
 insert into public.maoki_records(workspace_id,resource,data) values(a.workspace_id,'calls',jsonb_build_object('callId',call_id,'direction',dir,'number',counterpart,'contactName',coalesce(who,''),'agent','','status',st,'durationSec',secs,'startedAt',started,
   'recordingUrl',case when coalesce(payload->>'recordingUrl','') ~ '^https://[^\s/]+' then payload->>'recordingUrl' else '' end,'notes',''));
 d:=jsonb_build_object('action','call','resource','calls','label',left(counterpart,150),'actor','Tổng đài','timestamp',extract(epoch from clock_timestamp())*1000);
 insert into public.maoki_activity(workspace_id,data) values(a.workspace_id,d);
 return jsonb_build_object('ok',true,'created',true);
end;
$$;

create or replace function maoki_private.extras(op text,kind text default '',record_id uuid default null,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); w uuid; member_role text; r public.maoki_records; d jsonb; k text; v jsonb; spec jsonb; result jsonb;
 kinds constant text[]:=array['tags','rules','hours','reminders','ticketTypes','tickets','bots','journeys','customFields','fieldValues','popups','products','orders','webhooks','agentGroups','knowledge','calls','reviews'];
 specs constant jsonb:='{
  "tags":{"defaults":{"name":"","color":"blue","scope":"conversation","description":""},"required":["name"],"enums":{"color":["blue","green","amber","red","purple","gray"],"scope":["conversation","customer"]}},
  "rules":{"defaults":{"name":"","channel":"all","mode":"all","assignee":"","active":true},"required":["name"],"enums":{"channel":["all","webchat","facebook","instagram","zalo","email","airbnb","booking","agoda","whatsapp","tiktok"],"mode":["all","work_hours","off_hours"]}},
  "hours":{"defaults":{"name":"","kind":"work","days":[],"start":"08:00","end":"17:30","holidayDate":""},"required":["name"],"enums":{"kind":["work","holiday"]}},
  "reminders":{"defaults":{"title":"","dueDate":"","status":"todo","assignee":"","contactName":"","notes":""},"required":["title","dueDate"],"enums":{"status":["todo","done"]}},
  "ticketTypes":{"defaults":{"name":"","slaHours":24,"description":""},"required":["name"],"numbers":{"slaHours":[1,720]}},
  "tickets":{"defaults":{"title":"","type":"","priority":"normal","status":"open","assignee":"","contactName":"","deadline":"","description":""},"required":["title"],"enums":{"priority":["low","normal","high","urgent"],"status":["open","doing","waiting","done"]}},
  "bots":{"defaults":{"name":"","channel":"all","trigger":"new_conversation","keyword":"","message":"","replies":"","active":true},"required":["name","message"],"enums":{"channel":["all","webchat","facebook","instagram","zalo","email","whatsapp","tiktok"],"trigger":["visit","outside_hours","keyword","new_conversation","facebook_ad"]}},
  "journeys":{"defaults":{"name":"","trigger":"new_contact","steps":"","status":"active"},"required":["name","steps"],"enums":{"trigger":["new_contact","booking_confirmed","before_checkin","after_checkout","no_reply"],"status":["active","paused"]}},
  "customFields":{"defaults":{"name":"","type":"text","options":"","required":false},"required":["name"],"enums":{"type":["text","number","date","select"]}},
  "fieldValues":{"defaults":{"contactId":"","fieldId":"","value":""},"required":["contactId","fieldId","value"]},
  "popups":{"defaults":{"name":"","kind":"popup","title":"","message":"","fields":"","trigger":"delay","delaySeconds":10,"pageUrl":"","active":true},"required":["name","title"],"enums":{"kind":["popup","prechat"],"trigger":["delay","exit","off_hours","page"]},"numbers":{"delaySeconds":[0,600]}},
  "products":{"defaults":{"name":"","category":"","price":0,"unit":"","description":"","active":true},"required":["name"],"numbers":{"price":[0,1000000000]}},
  "orders":{"defaults":{"productId":"","guestName":"","quantity":1,"total":0,"status":"new","bookingNote":"","notes":""},"required":["productId","guestName"],"enums":{"status":["new","processing","delivered","cancelled"]},"numbers":{"quantity":[1,1000],"total":[0,1000000000]}},
  "webhooks":{"defaults":{"name":"","url":"","events":[],"active":true},"required":["name","url"]},
  "agentGroups":{"defaults":{"name":"","members":[],"description":""},"required":["name"]},
  "knowledge":{"defaults":{"title":"","content":"","active":true},"required":["title","content"]},
  "calls":{"defaults":{"callId":"","direction":"inbound","number":"","contactName":"","agent":"","status":"answered","durationSec":0,"startedAt":"","recordingUrl":"","notes":""},"required":["number"],"enums":{"direction":["inbound","outbound"],"status":["answered","missed","busy","failed","voicemail"]},"numbers":{"durationSec":[0,86400]}},
  "reviews":{"defaults":{"reviewId":"","reviewName":"","reviewer":"","rating":5,"comment":"","reviewedAt":"","reply":"","repliedAt":"","status":"new"},"required":["reviewer"],"enums":{"status":["new","replied","ignored"]},"numbers":{"rating":[1,5]}}
 }';
begin
 if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Vui lòng đăng nhập bằng tài khoản Supabase'; end if;
 select workspace_id,m.role into w,member_role from public.maoki_members m where user_id=uid and is_current;
 if op='snapshot' then
   result:='{}'::jsonb;
   if w is null then
     foreach k in array kinds loop result:=result || jsonb_build_object(k,'[]'::jsonb); end loop;
     return result;
   end if;
   foreach k in array kinds loop
     result:=result || jsonb_build_object(k,(select coalesce(jsonb_agg(maoki_private.pack(x) order by x.created_at desc),'[]') from public.maoki_records x where workspace_id=w and resource=k));
   end loop;
   return result;
 end if;
 if w is null then raise exception 'Hãy mở không gian trước'; end if;
 if not (kind = any(kinds)) then raise exception 'Loại dữ liệu không hợp lệ'; end if;
 if member_role='viewer' or (member_role='agent' and kind not in ('reminders','tickets','calls')) then raise exception 'Bạn không có quyền thực hiện thao tác này'; end if;
 perform pg_advisory_xact_lock(hashtextextended(w::text,1));
 if record_id is not null then
   select * into r from public.maoki_records where id=record_id and workspace_id=w and resource=kind;
   if r.id is null then raise exception 'Không tìm thấy bản ghi'; end if;
 end if;
 if op='delete' then
   if r.id is null then raise exception 'Không tìm thấy bản ghi'; end if;
   delete from public.maoki_records where id=r.id;
   perform maoki_private.audit(w,'delete',kind,coalesce(r.data->>'title',r.data->>'name',kind));
   return '{"ok":true}';
 elsif op<>'save' then raise exception 'Thao tác không được hỗ trợ';
 end if;
 spec:=specs->kind;
 if jsonb_typeof(payload)<>'object' or length(payload::text)>100000 then raise exception 'Dữ liệu không hợp lệ'; end if;
 for k,v in select * from jsonb_each(payload) loop
   if not (spec->'defaults' ? k) then raise exception 'Trường không được phép: %',k; end if;
   if jsonb_typeof(v)<>jsonb_typeof(spec->'defaults'->k) then raise exception 'Kiểu dữ liệu không hợp lệ: %',k; end if;
   if jsonb_typeof(v)='string' and length(v#>>'{}')>10000 then raise exception 'Nội dung quá dài: %',k; end if;
   if jsonb_typeof(v)='array' and jsonb_array_length(v)>100 then raise exception 'Danh sách quá dài: %',k; end if;
 end loop;
 d:=(spec->'defaults') || coalesce(r.data,'{}'::jsonb) || payload;
 for k in select jsonb_array_elements_text(spec->'required') loop
   if length(trim(d->>k))=0 then raise exception 'Vui lòng nhập: %',k; end if;
 end loop;
 for k,v in select * from jsonb_each(coalesce(spec->'enums','{}')) loop
   if not (v ? (d->>k)) then raise exception 'Giá trị không hợp lệ: %',k; end if;
 end loop;
 for k,v in select * from jsonb_each(coalesce(spec->'numbers','{}')) loop
   if (d->>k)::numeric<(v->>0)::numeric or (d->>k)::numeric>(v->>1)::numeric then raise exception 'Số không hợp lệ: %',k; end if;
 end loop;
 if length(d->>'name')>150 or length(d->>'title')>150 then raise exception 'Tên quá dài'; end if;
 foreach k in array array['dueDate','holidayDate','deadline'] loop
   if coalesce(d->>k,'')<>'' then
     if d->>k !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Ngày không hợp lệ'; end if;
     perform (d->>k)::date;
   end if;
 end loop;
 if kind='hours' then
   if d->>'start' !~ '^([01]\d|2[0-3]):[0-5]\d$' or d->>'end' !~ '^([01]\d|2[0-3]):[0-5]\d$' or d->>'start'>=d->>'end' then raise exception 'Giờ làm việc không hợp lệ'; end if;
   if d->>'kind'='holiday' and coalesce(d->>'holidayDate','')='' then raise exception 'Vui lòng chọn ngày nghỉ'; end if;
 end if;
 if kind='calls' and coalesce(d->>'recordingUrl','')<>'' and d->>'recordingUrl' !~ '^https://[^\s/]+' then raise exception 'Liên kết ghi âm phải bắt đầu bằng https://'; end if;
 if kind in ('calls','reviews') then foreach k in array array['durationSec','rating'] loop if d ? k and mod((d->>k)::numeric,1)<>0 then raise exception 'Vui lòng nhập số nguyên: %',k; end if; end loop; end if;
 if kind in ('calls','reviews') then foreach k in array array['startedAt','reviewedAt','repliedAt'] loop if coalesce(d->>k,'')<>'' then perform (d->>k)::timestamptz; end if; end loop; end if;
 if kind='webhooks' and d->>'url' !~ '^https://[^\s/]+' then raise exception 'Địa chỉ webhook phải bắt đầu bằng https://'; end if;
 if kind in ('orders','popups') then foreach k in array array['quantity','delaySeconds'] loop if d ? k and mod((d->>k)::numeric,1)<>0 then raise exception 'Vui lòng nhập số nguyên: %',k; end if; end loop; end if;
 if kind='orders' and not exists(select 1 from public.maoki_records where workspace_id=w and resource='products' and id::text=d->>'productId') then raise exception 'Sản phẩm không tồn tại'; end if;
 if kind='fieldValues' and (not exists(select 1 from public.maoki_records where workspace_id=w and resource='contacts' and id::text=d->>'contactId') or not exists(select 1 from public.maoki_records where workspace_id=w and resource='customFields' and id::text=d->>'fieldId')) then raise exception 'Khách hoặc trường thông tin không tồn tại'; end if;
 if r.id is null then r.id:=gen_random_uuid(); end if;
 insert into public.maoki_records(id,workspace_id,resource,data) values(r.id,w,kind,d) on conflict(id) do update set data=excluded.data,updated_at=clock_timestamp();
 perform maoki_private.audit(w,'save',kind,coalesce(d->>'title',d->>'name',kind));
 return (select maoki_private.pack(x) from public.maoki_records x where id=r.id);
end;
$$;
create or replace function maoki_private.channel_accounts_rpc(op text, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); w uuid; member_role text; a maoki_private.channel_accounts; plat text; cfg jsonb; k text; v jsonb; t maoki_private.channel_threads;
 secrets constant text[]:=array['appSecret','accessToken','refreshToken','smtpPass','resendKey','pageAccessToken','outboundToken','clientSecret'];
 allowed constant jsonb:='{"zalo":["appId","oaId","appSecret","accessToken","refreshToken","tokenExpiresAt"],"email":["provider","fromName","fromAddress","smtpHost","smtpPort","smtpUser","smtpPass","resendKey"],"facebook":["appSecret","pageId","pageAccessToken"],"instagram":["appSecret","pageId","pageAccessToken"],"whatsapp":["appSecret","phoneNumberId","accessToken"],"tiktok":["outboundUrl","outboundToken","label"],"phone":["hotline","provider"],"google":["clientId","clientSecret","refreshToken","accountId","locationId"]}';
begin
 if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Vui lòng đăng nhập'; end if;
 if jsonb_typeof(payload)<>'object' or octet_length(payload::text)>12000 then raise exception 'Yêu cầu không hợp lệ'; end if;
 select workspace_id,role into w,member_role from public.maoki_members where user_id=uid and is_current;
 if w is null then raise exception 'Hãy mở không gian quản lý trước'; end if;
 if op='send_context' then
   if member_role not in ('owner','manager','agent') then raise exception 'Vai trò hiện tại không được gửi tin'; end if;
   perform maoki_private.budget(w,'channel_send',60);
   select * into t from maoki_private.channel_threads where workspace_id=w and conversation_id=(payload->>'conversationId')::uuid limit 1;
   if t.conversation_id is null then return jsonb_build_object('thread',false); end if;
   select * into a from maoki_private.channel_accounts where workspace_id=w and platform=t.platform and enabled;
   if a.id is null then return jsonb_build_object('thread',true,'configured',false,'platform',t.platform); end if;
   return jsonb_build_object('thread',true,'configured',true,'platform',t.platform,'externalId',t.external_id,'meta',t.meta,'config',a.config);
 elsif op='tokens' then
   if member_role not in ('owner','manager','agent') then raise exception 'Vai trò hiện tại không được gửi tin'; end if;
   update maoki_private.channel_accounts set config=config || jsonb_strip_nulls(jsonb_build_object('accessToken',payload->>'accessToken','refreshToken',payload->>'refreshToken','tokenExpiresAt',payload->>'tokenExpiresAt')),updated_at=now() where workspace_id=w and platform='zalo';
   return '{"ok":true}';
 elsif op='thread_meta' then
   if member_role not in ('owner','manager','agent') then raise exception 'Vai trò hiện tại không được gửi tin'; end if;
   update maoki_private.channel_threads set meta=meta || coalesce(payload->'meta','{}') where workspace_id=w and conversation_id=(payload->>'conversationId')::uuid;
   return '{"ok":true}';
 end if;
 if member_role not in ('owner','manager') then raise exception 'Chỉ chủ không gian và quản lý được thay đổi kênh nhắn tin'; end if;
 if op='status' then
   return (select coalesce(jsonb_agg(jsonb_build_object('platform',x.platform,'label',x.label,'enabled',x.enabled,'inboundToken',x.inbound_token,'verifyToken',left(encode(sha256(convert_to('verify' || x.inbound_token,'UTF8')),'hex'),24),'updatedAt',x.updated_at,'updatedBy',x.updated_by,
     'config',(select coalesce(jsonb_object_agg(e.key,case when e.key=any(secrets) then to_jsonb(right(e.value#>>'{}',4) <> '' and e.value#>>'{}' <> '') else e.value end),'{}') from jsonb_each(x.config) e))),'[]')
     from maoki_private.channel_accounts x where x.workspace_id=w);
 elsif op='save' then
   perform maoki_private.budget(w,'channel_settings',20);
   plat:=payload->>'platform';
   if plat not in ('zalo','email','facebook','instagram','whatsapp','tiktok','phone','google') then raise exception 'Kênh không hợp lệ'; end if;
   if jsonb_typeof(coalesce(payload->'config','{}'))<>'object' then raise exception 'Cấu hình không hợp lệ'; end if;
   cfg:='{}';
   for k,v in select * from jsonb_each(coalesce(payload->'config','{}')) loop
     if not (allowed->plat ? k) or jsonb_typeof(v)<>'string' or length(v#>>'{}')>2000 then raise exception 'Cấu hình không hợp lệ: %',k; end if;
     if k=any(secrets) and trim(v#>>'{}')='' then continue; end if; -- blank secret keeps the stored value
     cfg:=cfg || jsonb_build_object(k,trim(v#>>'{}'));
   end loop;
   if plat='tiktok' and cfg ? 'outboundUrl' and cfg->>'outboundUrl' <> '' and cfg->>'outboundUrl' !~ '^https://[^\s/]+' then raise exception 'Địa chỉ cầu nối phải bắt đầu bằng https://'; end if;
   if plat='whatsapp' and cfg ? 'phoneNumberId' and cfg->>'phoneNumberId' !~ '^\d{5,25}$' then raise exception 'Phone number ID không hợp lệ'; end if;
   if plat='email' then
     if cfg ? 'provider' and cfg->>'provider' not in ('smtp','resend') then raise exception 'Nhà cung cấp email không hợp lệ'; end if;
     if cfg ? 'fromAddress' and cfg->>'fromAddress' !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Email gửi đi không hợp lệ'; end if;
     if cfg ? 'smtpPort' and cfg->>'smtpPort' !~ '^\d{2,5}$' then raise exception 'Cổng SMTP không hợp lệ'; end if;
   end if;
   insert into maoki_private.channel_accounts(workspace_id,platform,label,enabled,config,updated_by)
     values(w,plat,left(coalesce(payload->>'label',''),80),coalesce((payload->>'enabled')::boolean,true),cfg,coalesce(auth.jwt()->>'email',''))
     on conflict(workspace_id,platform) do update set label=case when payload ? 'label' then left(payload->>'label',80) else channel_accounts.label end,
       enabled=case when payload ? 'enabled' then (payload->>'enabled')::boolean else channel_accounts.enabled end,
       config=channel_accounts.config || cfg,updated_at=now(),updated_by=coalesce(auth.jwt()->>'email','');
   perform maoki_private.audit(w,'update','channel','Cập nhật kênh ' || plat);
   return '{"ok":true}';
 elsif op='rotate' then
   update maoki_private.channel_accounts set inbound_token=replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),updated_at=now() where workspace_id=w and platform=payload->>'platform';
   return '{"ok":true}';
 elsif op='delete' then
   delete from maoki_private.channel_accounts where workspace_id=w and platform=payload->>'platform';
   perform maoki_private.audit(w,'delete','channel',coalesce(payload->>'platform','kênh'));
   return '{"ok":true}';
 else raise exception 'Thao tác không được hỗ trợ'; end if;
end;
$$;

create or replace function maoki_private.channel_inbound(token text, payload jsonb default '{}', raw text default '', signature text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare a maoki_private.channel_accounts; ev jsonb; entry jsonb; item jsonb; change jsonb; contact_name text; msg_text text; expected text; out jsonb; done integer:=0; last_id uuid; sender text;
begin
 if token !~ '^[a-f0-9]{64}$' then raise exception 'Liên kết không hợp lệ'; end if;
 select * into a from maoki_private.channel_accounts where inbound_token=token and enabled;
 if a.id is null then raise exception 'Liên kết không hợp lệ'; end if;
 perform maoki_private.budget(a.workspace_id,'channel_inbound',120);
 perform pg_advisory_xact_lock(hashtextextended(a.workspace_id::text,1));
 if a.platform='zalo' then
   if length(raw)>20000 then raise exception 'Yêu cầu quá lớn'; end if;
   ev:=raw::jsonb;
   expected:=encode(sha256(convert_to(coalesce(a.config->>'appId','') || raw || coalesce(ev->>'timestamp','') || coalesce(a.config->>'appSecret',''),'UTF8')),'hex');
   if coalesce(a.config->>'appSecret','')='' or lower(regexp_replace(signature,'^mac=','')) <> expected then raise exception 'Chữ ký không hợp lệ'; end if;
   if ev->>'app_id' is distinct from a.config->>'appId' then raise exception 'Sai ứng dụng Zalo'; end if;
   if ev->>'event_name' <> 'user_send_text' then return jsonb_build_object('ok',true,'ignored',true); end if;
   return maoki_private.channel_ingest(a,ev#>>'{sender,id}',ev#>>'{message,text}',coalesce(ev#>>'{message,msg_id}',''),'Zalo ' || right(coalesce(ev#>>'{sender,id}',''),4),coalesce((ev->>'timestamp')::numeric,extract(epoch from clock_timestamp())*1000));
 elsif a.platform in ('facebook','instagram') then
   if length(raw)>200000 then raise exception 'Yêu cầu quá lớn'; end if;
   expected:=maoki_private.hmac_sha256(coalesce(a.config->>'appSecret',''),raw);
   if coalesce(a.config->>'appSecret','')='' or lower(regexp_replace(signature,'^sha256=','')) <> expected then raise exception 'Chữ ký không hợp lệ'; end if;
   ev:=raw::jsonb;
   if ev->>'object' is distinct from (case a.platform when 'facebook' then 'page' else 'instagram' end) then return jsonb_build_object('ok',true,'ignored',true); end if;
   for entry in select value from jsonb_array_elements(coalesce(ev->'entry','[]')) loop
     if a.platform='facebook' and coalesce(a.config->>'pageId','')<>'' and entry->>'id' is distinct from a.config->>'pageId' then continue; end if;
     for item in select value from jsonb_array_elements(coalesce(entry->'messaging','[]')) loop
       sender:=item#>>'{sender,id}';
       -- Echoes are our own outgoing messages; only plain text from the guest becomes a conversation message.
       if coalesce((item#>>'{message,is_echo}')::boolean,false) or item#>>'{message,text}' is null or sender is null or sender=entry->>'id' then continue; end if;
       out:=maoki_private.channel_ingest(a,sender,item#>>'{message,text}',coalesce(item#>>'{message,mid}',''),case a.platform when 'facebook' then 'Facebook ' else 'Instagram ' end || right(sender,4),coalesce((item->>'timestamp')::numeric,extract(epoch from clock_timestamp())*1000));
       if out->>'conversationId' is not null then done:=done+1; last_id:=(out->>'conversationId')::uuid; end if;
     end loop;
   end loop;
   return jsonb_build_object('ok',true,'received',done) || case when last_id is not null then jsonb_build_object('conversationId',last_id) else '{}'::jsonb end;
   elsif a.platform='whatsapp' then
   if length(raw)>200000 then raise exception 'Yêu cầu quá lớn'; end if;
   expected:=maoki_private.hmac_sha256(coalesce(a.config->>'appSecret',''),raw);
   if coalesce(a.config->>'appSecret','')='' or lower(regexp_replace(signature,'^sha256=','')) <> expected then raise exception 'Chữ ký không hợp lệ'; end if;
   ev:=raw::jsonb;
   if ev->>'object' is distinct from 'whatsapp_business_account' then return jsonb_build_object('ok',true,'ignored',true); end if;
   for entry in select value from jsonb_array_elements(coalesce(ev->'entry','[]')) loop
     for change in select value from jsonb_array_elements(coalesce(entry->'changes','[]')) loop
       -- Only messages delivered to the configured business number; status updates have no "messages".
       if coalesce(a.config->>'phoneNumberId','')<>'' and change#>>'{value,metadata,phone_number_id}' is distinct from a.config->>'phoneNumberId' then continue; end if;
       for item in select value from jsonb_array_elements(coalesce(change#>'{value,messages}','[]')) loop
         sender:=item->>'from'; if sender is null then continue; end if;
         contact_name:=(select c#>>'{profile,name}' from jsonb_array_elements(coalesce(change#>'{value,contacts}','[]')) c where c->>'wa_id'=sender limit 1);
         msg_text:=case when item->>'type'='text' then item#>>'{text,body}' else '[' || coalesce(item->>'type','tin nhắn') || ' — mở WhatsApp để xem]' end;
         out:=maoki_private.channel_ingest(a,sender,msg_text,coalesce(item->>'id',''),coalesce(nullif(trim(contact_name),''),'+' || sender),coalesce((item->>'timestamp')::numeric*1000,extract(epoch from clock_timestamp())*1000));
         if out->>'conversationId' is not null then done:=done+1; last_id:=(out->>'conversationId')::uuid; end if;
       end loop;
     end loop;
   end loop;
   return jsonb_build_object('ok',true,'received',done) || case when last_id is not null then jsonb_build_object('conversationId',last_id) else '{}'::jsonb end;
   elsif a.platform='phone' then
   if jsonb_typeof(payload)<>'object' or octet_length(payload::text)>20000 then raise exception 'Yêu cầu không hợp lệ'; end if;
   return maoki_private.channel_call(a,coalesce(payload->'call','{}'::jsonb));
 elsif a.platform='tiktok' then
   if jsonb_typeof(payload)<>'object' or octet_length(payload::text)>60000 then raise exception 'Yêu cầu không hợp lệ'; end if;
   sender:=left(trim(coalesce(payload->>'from','')),100);
   return maoki_private.channel_ingest(a,sender,coalesce(payload->>'fullText',payload->>'text'),coalesce(payload->>'messageId',''),coalesce(nullif(trim(payload->>'name'),''),'TikTok ' || right(sender,4)),coalesce(nullif(payload->>'timestamp','')::numeric,extract(epoch from clock_timestamp())*1000));
 else
   if jsonb_typeof(payload)<>'object' or octet_length(payload::text)>60000 then raise exception 'Yêu cầu không hợp lệ'; end if;
   sender:=lower(trim(coalesce(payload->>'from','')));
   if sender !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Email người gửi không hợp lệ'; end if;
   if sender=lower(coalesce(a.config->>'fromAddress','')) then return jsonb_build_object('ok',true,'ignored',true); end if; -- never loop our own mail back in
   return maoki_private.channel_ingest(a,sender,payload->>'text',coalesce(payload->>'messageId',''),coalesce(nullif(trim(payload->>'name'),''),sender),extract(epoch from clock_timestamp())*1000,left(coalesce(payload->>'subject',''),200));
 end if;
end;
$$;

-- Google Business Profile reviews: the Vercel API fetches them with the stored OAuth credentials and upserts here.
create function maoki_private.reviews_rpc(op text, payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); w uuid; member_role text; a maoki_private.channel_accounts; item jsonb; existing public.maoki_records; d jsonb; added integer:=0; changed integer:=0; rec public.maoki_records;
begin
 if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Vui lòng đăng nhập'; end if;
 if jsonb_typeof(payload)<>'object' or octet_length(payload::text)>400000 then raise exception 'Yêu cầu không hợp lệ'; end if;
 select workspace_id,role into w,member_role from public.maoki_members where user_id=uid and is_current;
 if w is null then raise exception 'Hãy mở không gian quản lý trước'; end if;
 if member_role not in ('owner','manager') then raise exception 'Chỉ chủ không gian và quản lý được quản lý đánh giá Google'; end if;
 perform maoki_private.budget(w,'reviews',30);
 if op='context' then
   select * into a from maoki_private.channel_accounts where workspace_id=w and platform='google' and enabled;
   if a.id is null then return jsonb_build_object('configured',false); end if;
   if payload ? 'recordId' then select * into rec from public.maoki_records where id=(payload->>'recordId')::uuid and workspace_id=w and resource='reviews'; end if;
   return jsonb_build_object('configured',true,'config',a.config) || case when rec.id is not null then jsonb_build_object('review',maoki_private.pack(rec)) else '{}'::jsonb end;
 elsif op='upsert' then
   perform pg_advisory_xact_lock(hashtextextended(w::text,1));
   for item in select value from jsonb_array_elements(coalesce(payload->'items','[]')) limit 200 loop
     if coalesce(item->>'reviewId','')='' or (item->>'rating')::integer not between 1 and 5 then continue; end if;
     select * into existing from public.maoki_records where workspace_id=w and resource='reviews' and data->>'reviewId'=item->>'reviewId' limit 1;
     d:=jsonb_build_object('reviewId',left(item->>'reviewId',200),'reviewName',left(coalesce(item->>'reviewName',''),300),'reviewer',left(coalesce(nullif(trim(item->>'reviewer'),''),'Ẩn danh'),150),'rating',(item->>'rating')::integer,'comment',left(coalesce(item->>'comment',''),5000),
       'reviewedAt',coalesce(nullif(item->>'reviewedAt',''),to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"')),'reply',left(coalesce(nullif(item->>'reply',''),existing.data->>'reply',''),4000),'repliedAt',coalesce(nullif(item->>'repliedAt',''),existing.data->>'repliedAt',''),
       'status',case when coalesce(item->>'reply','')<>'' then 'replied' else coalesce(existing.data->>'status','new') end);
     if existing.id is null then insert into public.maoki_records(workspace_id,resource,data) values(w,'reviews',d); added:=added+1;
     else update public.maoki_records set data=existing.data || d,updated_at=clock_timestamp() where id=existing.id; changed:=changed+1; end if;
   end loop;
   perform maoki_private.audit(w,'sync','reviews','Đồng bộ đánh giá Google');
   return jsonb_build_object('added',added,'updated',changed);
 else raise exception 'Thao tác không được hỗ trợ'; end if;
end;
$$;
create function public.maoki_reviews(op text, payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select maoki_private.reviews_rpc(op,payload) $$;
revoke all on function maoki_private.reviews_rpc(text,jsonb), public.maoki_reviews(text,jsonb), maoki_private.channel_call(maoki_private.channel_accounts,jsonb), maoki_private.extras(text,text,uuid,jsonb), maoki_private.channel_inbound(text,jsonb,text,text), maoki_private.channel_accounts_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function maoki_private.reviews_rpc(text,jsonb), public.maoki_reviews(text,jsonb), maoki_private.channel_accounts_rpc(text,jsonb), maoki_private.extras(text,text,uuid,jsonb) to authenticated;
grant execute on function maoki_private.channel_inbound(text,jsonb,text,text) to anon, authenticated;
