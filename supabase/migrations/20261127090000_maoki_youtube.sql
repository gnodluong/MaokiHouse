-- YouTube channel comments (sync + reply).
alter table maoki_private.channel_accounts drop constraint if exists channel_accounts_platform_check;
alter table maoki_private.channel_accounts add constraint channel_accounts_platform_check check(platform in ('zalo','email','facebook','instagram','whatsapp','tiktok','phone','google','youtube'));
alter table public.maoki_records drop constraint if exists maoki_records_resource_check;
alter table public.maoki_records add constraint maoki_records_resource_check check(resource in (
  'properties','bookings','contacts','conversations','tasks','rates','guidebooks','owners','automations','campaigns','replies','integrations','employees','revenue',
  'tags','rules','hours','reminders','ticketTypes','tickets','bots','journeys','customFields','fieldValues','popups','products','orders','webhooks','agentGroups','knowledge','calls','reviews','ytComments'));

create or replace function maoki_private.extras(op text,kind text default '',record_id uuid default null,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); w uuid; member_role text; r public.maoki_records; d jsonb; k text; v jsonb; spec jsonb; result jsonb;
 kinds constant text[]:=array['tags','rules','hours','reminders','ticketTypes','tickets','bots','journeys','customFields','fieldValues','popups','products','orders','webhooks','agentGroups','knowledge','calls','reviews','ytComments'];
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
  "ytComments":{"defaults":{"commentId":"","videoId":"","author":"","authorChannelId":"","text":"","publishedAt":"","likes":0,"replyCount":0,"reply":"","repliedAt":"","status":"new"},"required":["author"],"enums":{"status":["new","replied","ignored"]},"numbers":{"likes":[0,100000000],"replyCount":[0,100000]}},
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
 if kind in ('calls','reviews','ytComments') then foreach k in array array['durationSec','rating','likes','replyCount'] loop if d ? k and mod((d->>k)::numeric,1)<>0 then raise exception 'Vui lòng nhập số nguyên: %',k; end if; end loop; end if;
 if kind in ('calls','reviews','ytComments') then foreach k in array array['startedAt','reviewedAt','repliedAt','publishedAt'] loop if coalesce(d->>k,'')<>'' then perform (d->>k)::timestamptz; end if; end loop; end if;
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
 allowed constant jsonb:='{"zalo":["appId","oaId","appSecret","accessToken","refreshToken","tokenExpiresAt"],"email":["provider","fromName","fromAddress","smtpHost","smtpPort","smtpUser","smtpPass","resendKey"],"facebook":["appSecret","pageId","pageAccessToken"],"instagram":["appSecret","pageId","pageAccessToken"],"whatsapp":["appSecret","phoneNumberId","accessToken"],"tiktok":["outboundUrl","outboundToken","label"],"phone":["hotline","provider"],"google":["clientId","clientSecret","refreshToken","accountId","locationId"],"youtube":["clientId","clientSecret","refreshToken","channelId"]}';
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
   if plat not in ('zalo','email','facebook','instagram','whatsapp','tiktok','phone','google','youtube') then raise exception 'Kênh không hợp lệ'; end if;
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

-- YouTube comments: the Vercel API fetches channel comments with the stored OAuth credentials and upserts them here.
create function maoki_private.youtube_rpc(op text, payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); w uuid; member_role text; a maoki_private.channel_accounts; item jsonb; existing public.maoki_records; d jsonb; added integer:=0; changed integer:=0; rec public.maoki_records;
begin
 if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Vui lòng đăng nhập'; end if;
 if jsonb_typeof(payload)<>'object' or octet_length(payload::text)>400000 then raise exception 'Yêu cầu không hợp lệ'; end if;
 select workspace_id,role into w,member_role from public.maoki_members where user_id=uid and is_current;
 if w is null then raise exception 'Hãy mở không gian quản lý trước'; end if;
 if member_role not in ('owner','manager') then raise exception 'Chỉ chủ không gian và quản lý được quản lý bình luận YouTube'; end if;
 perform maoki_private.budget(w,'youtube',30);
 if op='context' then
   select * into a from maoki_private.channel_accounts where workspace_id=w and platform='youtube' and enabled;
   if a.id is null then return jsonb_build_object('configured',false); end if;
   if payload ? 'recordId' then select * into rec from public.maoki_records where id=(payload->>'recordId')::uuid and workspace_id=w and resource='ytComments'; end if;
   return jsonb_build_object('configured',true,'config',a.config) || case when rec.id is not null then jsonb_build_object('comment',maoki_private.pack(rec)) else '{}'::jsonb end;
 elsif op='upsert' then
   perform pg_advisory_xact_lock(hashtextextended(w::text,1));
   for item in select value from jsonb_array_elements(coalesce(payload->'items','[]')) limit 200 loop
     if coalesce(item->>'commentId','')='' or coalesce(item->>'text','')='' then continue; end if;
     select * into existing from public.maoki_records where workspace_id=w and resource='ytComments' and data->>'commentId'=item->>'commentId' limit 1;
     d:=jsonb_build_object('commentId',left(item->>'commentId',200),'videoId',left(coalesce(item->>'videoId',''),40),'author',left(coalesce(nullif(trim(item->>'author'),''),'Ẩn danh'),150),'authorChannelId',left(coalesce(item->>'authorChannelId',''),60),
       'text',left(item->>'text',5000),'publishedAt',coalesce(nullif(item->>'publishedAt',''),to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"')),'likes',greatest(0,coalesce((item->>'likes')::integer,0)),'replyCount',greatest(0,coalesce((item->>'replyCount')::integer,0)),
       'reply',left(coalesce(nullif(item->>'reply',''),existing.data->>'reply',''),4000),'repliedAt',coalesce(nullif(item->>'repliedAt',''),existing.data->>'repliedAt',''),
       'status',case when coalesce(item->>'reply','')<>'' then 'replied' else coalesce(existing.data->>'status','new') end);
     if existing.id is null then insert into public.maoki_records(workspace_id,resource,data) values(w,'ytComments',d); added:=added+1;
     else update public.maoki_records set data=existing.data || d,updated_at=clock_timestamp() where id=existing.id; changed:=changed+1; end if;
   end loop;
   perform maoki_private.audit(w,'sync','ytComments','Đồng bộ bình luận YouTube');
   return jsonb_build_object('added',added,'updated',changed);
 else raise exception 'Thao tác không được hỗ trợ'; end if;
end;
$$;
create function public.maoki_youtube(op text, payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select maoki_private.youtube_rpc(op,payload) $$;
revoke all on function maoki_private.youtube_rpc(text,jsonb), public.maoki_youtube(text,jsonb), maoki_private.extras(text,text,uuid,jsonb), maoki_private.channel_accounts_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function maoki_private.youtube_rpc(text,jsonb), public.maoki_youtube(text,jsonb), maoki_private.channel_accounts_rpc(text,jsonb), maoki_private.extras(text,text,uuid,jsonb) to authenticated;
