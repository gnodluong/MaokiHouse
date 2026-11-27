-- ===== supabase/migrations/20261122090000_maoki_subiz_features.sql =====
-- Conversation & support features inspired by Subiz: tags, routing rules, working hours,
-- reminders, tickets (+ types/SLA), chatbot scripts and customer journeys.
-- Stored as ordinary maoki_records rows; a separate RPC keeps the existing maoki_workspace function untouched.
alter table public.maoki_records drop constraint if exists maoki_records_resource_check;
alter table public.maoki_records add constraint maoki_records_resource_check check(resource in (
  'properties','bookings','contacts','conversations','tasks','rates','guidebooks','owners','automations','campaigns','replies','integrations','employees','revenue',
  'tags','rules','hours','reminders','ticketTypes','tickets','bots','journeys'));

create function maoki_private.extras(op text,kind text default '',record_id uuid default null,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); w uuid; member_role text; r public.maoki_records; d jsonb; k text; v jsonb; spec jsonb; result jsonb;
 kinds constant text[]:=array['tags','rules','hours','reminders','ticketTypes','tickets','bots','journeys'];
 specs constant jsonb:='{
  "tags":{"defaults":{"name":"","color":"blue","scope":"conversation","description":""},"required":["name"],"enums":{"color":["blue","green","amber","red","purple","gray"],"scope":["conversation","customer"]}},
  "rules":{"defaults":{"name":"","channel":"all","mode":"all","assignee":"","active":true},"required":["name"],"enums":{"channel":["all","webchat","facebook","instagram","zalo","email","airbnb","booking","agoda"],"mode":["all","work_hours","off_hours"]}},
  "hours":{"defaults":{"name":"","kind":"work","days":[],"start":"08:00","end":"17:30","holidayDate":""},"required":["name"],"enums":{"kind":["work","holiday"]}},
  "reminders":{"defaults":{"title":"","dueDate":"","status":"todo","assignee":"","contactName":"","notes":""},"required":["title","dueDate"],"enums":{"status":["todo","done"]}},
  "ticketTypes":{"defaults":{"name":"","slaHours":24,"description":""},"required":["name"],"numbers":{"slaHours":[1,720]}},
  "tickets":{"defaults":{"title":"","type":"","priority":"normal","status":"open","assignee":"","contactName":"","deadline":"","description":""},"required":["title"],"enums":{"priority":["low","normal","high","urgent"],"status":["open","doing","waiting","done"]}},
  "bots":{"defaults":{"name":"","channel":"all","trigger":"new_conversation","keyword":"","message":"","replies":"","active":true},"required":["name","message"],"enums":{"channel":["all","webchat","facebook","instagram","zalo","email"],"trigger":["visit","outside_hours","keyword","new_conversation","facebook_ad"]}},
  "journeys":{"defaults":{"name":"","trigger":"new_contact","steps":"","status":"active"},"required":["name","steps"],"enums":{"trigger":["new_contact","booking_confirmed","before_checkin","after_checkout","no_reply"],"status":["active","paused"]}}
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
 if member_role='viewer' or (member_role='agent' and kind not in ('reminders','tickets')) then raise exception 'Bạn không có quyền thực hiện thao tác này'; end if;
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
 if r.id is null then r.id:=gen_random_uuid(); end if;
 insert into public.maoki_records(id,workspace_id,resource,data) values(r.id,w,kind,d) on conflict(id) do update set data=excluded.data,updated_at=clock_timestamp();
 perform maoki_private.audit(w,'save',kind,coalesce(d->>'title',d->>'name',kind));
 return (select maoki_private.pack(x) from public.maoki_records x where id=r.id);
end;
$$;
create function public.maoki_extras(op text,kind text default '',record_id uuid default null,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$
 select maoki_private.extras(op,kind,record_id,payload);
$$;
revoke all on function maoki_private.extras(text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function maoki_private.extras(text,text,uuid,jsonb) to authenticated;
revoke all on function public.maoki_extras(text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.maoki_extras(text,text,uuid,jsonb) to authenticated;

-- ===== supabase/migrations/20261122120000_maoki_subiz_features_2.sql =====
-- Second batch of Subiz-inspired resources: custom guest fields, popups / pre-chat forms, products & orders,
-- webhook endpoints, agent groups and an AI knowledge base. Replaces the extras RPC with the extended list.
alter table public.maoki_records drop constraint if exists maoki_records_resource_check;
alter table public.maoki_records add constraint maoki_records_resource_check check(resource in (
  'properties','bookings','contacts','conversations','tasks','rates','guidebooks','owners','automations','campaigns','replies','integrations','employees','revenue',
  'tags','rules','hours','reminders','ticketTypes','tickets','bots','journeys',
  'customFields','fieldValues','popups','products','orders','webhooks','agentGroups','knowledge'));

create or replace function maoki_private.extras(op text,kind text default '',record_id uuid default null,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); w uuid; member_role text; r public.maoki_records; d jsonb; k text; v jsonb; spec jsonb; result jsonb;
 kinds constant text[]:=array['tags','rules','hours','reminders','ticketTypes','tickets','bots','journeys','customFields','fieldValues','popups','products','orders','webhooks','agentGroups','knowledge'];
 specs constant jsonb:='{
  "tags":{"defaults":{"name":"","color":"blue","scope":"conversation","description":""},"required":["name"],"enums":{"color":["blue","green","amber","red","purple","gray"],"scope":["conversation","customer"]}},
  "rules":{"defaults":{"name":"","channel":"all","mode":"all","assignee":"","active":true},"required":["name"],"enums":{"channel":["all","webchat","facebook","instagram","zalo","email","airbnb","booking","agoda"],"mode":["all","work_hours","off_hours"]}},
  "hours":{"defaults":{"name":"","kind":"work","days":[],"start":"08:00","end":"17:30","holidayDate":""},"required":["name"],"enums":{"kind":["work","holiday"]}},
  "reminders":{"defaults":{"title":"","dueDate":"","status":"todo","assignee":"","contactName":"","notes":""},"required":["title","dueDate"],"enums":{"status":["todo","done"]}},
  "ticketTypes":{"defaults":{"name":"","slaHours":24,"description":""},"required":["name"],"numbers":{"slaHours":[1,720]}},
  "tickets":{"defaults":{"title":"","type":"","priority":"normal","status":"open","assignee":"","contactName":"","deadline":"","description":""},"required":["title"],"enums":{"priority":["low","normal","high","urgent"],"status":["open","doing","waiting","done"]}},
  "bots":{"defaults":{"name":"","channel":"all","trigger":"new_conversation","keyword":"","message":"","replies":"","active":true},"required":["name","message"],"enums":{"channel":["all","webchat","facebook","instagram","zalo","email"],"trigger":["visit","outside_hours","keyword","new_conversation","facebook_ad"]}},
  "journeys":{"defaults":{"name":"","trigger":"new_contact","steps":"","status":"active"},"required":["name","steps"],"enums":{"trigger":["new_contact","booking_confirmed","before_checkin","after_checkout","no_reply"],"status":["active","paused"]}},
  "customFields":{"defaults":{"name":"","type":"text","options":"","required":false},"required":["name"],"enums":{"type":["text","number","date","select"]}},
  "fieldValues":{"defaults":{"contactId":"","fieldId":"","value":""},"required":["contactId","fieldId","value"]},
  "popups":{"defaults":{"name":"","kind":"popup","title":"","message":"","fields":"","trigger":"delay","delaySeconds":10,"pageUrl":"","active":true},"required":["name","title"],"enums":{"kind":["popup","prechat"],"trigger":["delay","exit","off_hours","page"]},"numbers":{"delaySeconds":[0,600]}},
  "products":{"defaults":{"name":"","category":"","price":0,"unit":"","description":"","active":true},"required":["name"],"numbers":{"price":[0,1000000000]}},
  "orders":{"defaults":{"productId":"","guestName":"","quantity":1,"total":0,"status":"new","bookingNote":"","notes":""},"required":["productId","guestName"],"enums":{"status":["new","processing","delivered","cancelled"]},"numbers":{"quantity":[1,1000],"total":[0,1000000000]}},
  "webhooks":{"defaults":{"name":"","url":"","events":[],"active":true},"required":["name","url"]},
  "agentGroups":{"defaults":{"name":"","members":[],"description":""},"required":["name"]},
  "knowledge":{"defaults":{"title":"","content":"","active":true},"required":["title","content"]}
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
 if member_role='viewer' or (member_role='agent' and kind not in ('reminders','tickets')) then raise exception 'Bạn không có quyền thực hiện thao tác này'; end if;
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

-- ===== supabase/migrations/20261123090000_maoki_messaging_channels.sql =====
-- Zalo Official Account and email as two-way channels.
-- Credentials live in maoki_private (never in the workspace snapshot). Inbound messages arrive through
-- a per-account secret URL token and become ordinary conversations; replies are sent by the Vercel API.
create table maoki_private.channel_accounts (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.maoki_workspaces(id) on delete cascade,
 platform text not null check(platform in ('zalo','email')),
 label text not null default '' check(length(label)<=80),
 enabled boolean not null default true,
 inbound_token text not null unique default replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
 config jsonb not null default '{}' check(jsonb_typeof(config)='object' and octet_length(config::text)<=8000),
 updated_at timestamptz not null default now(),
 updated_by text not null default '',
 unique(workspace_id,platform)
);
create table maoki_private.channel_threads (
 workspace_id uuid not null references public.maoki_workspaces(id) on delete cascade,
 platform text not null,
 external_id text not null check(length(external_id)<=320),
 conversation_id uuid not null,
 meta jsonb not null default '{}',
 primary key(workspace_id,platform,external_id)
);
create index maoki_channel_threads_conversation on maoki_private.channel_threads(workspace_id,conversation_id);
alter table maoki_private.channel_accounts enable row level security;
alter table maoki_private.channel_threads enable row level security;
revoke all on maoki_private.channel_accounts, maoki_private.channel_threads from public,anon,authenticated;

-- Account management and send-time context for signed-in members.
create function maoki_private.channel_accounts_rpc(op text, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); w uuid; member_role text; a maoki_private.channel_accounts; plat text; cfg jsonb; k text; v jsonb; t maoki_private.channel_threads;
 secrets constant text[]:=array['appSecret','accessToken','refreshToken','smtpPass','resendKey'];
 allowed constant jsonb:='{"zalo":["appId","oaId","appSecret","accessToken","refreshToken","tokenExpiresAt"],"email":["provider","fromName","fromAddress","smtpHost","smtpPort","smtpUser","smtpPass","resendKey"]}';
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
   return (select coalesce(jsonb_agg(jsonb_build_object('platform',x.platform,'label',x.label,'enabled',x.enabled,'inboundToken',x.inbound_token,'updatedAt',x.updated_at,'updatedBy',x.updated_by,
     'config',(select coalesce(jsonb_object_agg(e.key,case when e.key=any(secrets) then to_jsonb(right(e.value#>>'{}',4) <> '' and e.value#>>'{}' <> '') else e.value end),'{}') from jsonb_each(x.config) e))),'[]')
     from maoki_private.channel_accounts x where x.workspace_id=w);
 elsif op='save' then
   perform maoki_private.budget(w,'channel_settings',20);
   plat:=payload->>'platform';
   if plat not in ('zalo','email') then raise exception 'Kênh không hợp lệ'; end if;
   if jsonb_typeof(coalesce(payload->'config','{}'))<>'object' then raise exception 'Cấu hình không hợp lệ'; end if;
   cfg:='{}';
   for k,v in select * from jsonb_each(coalesce(payload->'config','{}')) loop
     if not (allowed->plat ? k) or jsonb_typeof(v)<>'string' or length(v#>>'{}')>2000 then raise exception 'Cấu hình không hợp lệ: %',k; end if;
     if k=any(secrets) and trim(v#>>'{}')='' then continue; end if; -- blank secret keeps the stored value
     cfg:=cfg || jsonb_build_object(k,trim(v#>>'{}'));
   end loop;
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
   perform maoki_private.audit(w,'update','channel',case plat when 'zalo' then 'Cập nhật Zalo OA' else 'Cập nhật email' end);
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

-- Inbound messages: authenticated only by the secret URL token (+ Zalo's HMAC-style signature).
create function maoki_private.channel_inbound(token text, payload jsonb default '{}', raw text default '', signature text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 a maoki_private.channel_accounts; ev jsonb; ext text; msg_id text; body text; sender_name text; stamp numeric; expected text;
 t maoki_private.channel_threads; r public.maoki_records; cid uuid; msgs jsonb; seen jsonb; subject text;
begin
 if token !~ '^[a-f0-9]{64}$' then raise exception 'Liên kết không hợp lệ'; end if;
 select * into a from maoki_private.channel_accounts where inbound_token=token and enabled;
 if a.id is null then raise exception 'Liên kết không hợp lệ'; end if;
 perform maoki_private.budget(a.workspace_id,'channel_inbound',120);
 if a.platform='zalo' then
   if length(raw)>20000 then raise exception 'Yêu cầu quá lớn'; end if;
   ev:=raw::jsonb;
   expected:=encode(sha256(convert_to(coalesce(a.config->>'appId','') || raw || coalesce(ev->>'timestamp','') || coalesce(a.config->>'appSecret',''),'UTF8')),'hex');
   if coalesce(a.config->>'appSecret','')='' or lower(regexp_replace(signature,'^mac=','')) <> expected then raise exception 'Chữ ký không hợp lệ'; end if;
   if ev->>'app_id' is distinct from a.config->>'appId' then raise exception 'Sai ứng dụng Zalo'; end if;
   if ev->>'event_name' <> 'user_send_text' then return jsonb_build_object('ok',true,'ignored',true); end if;
   ext:=ev#>>'{sender,id}'; body:=ev#>>'{message,text}'; msg_id:=coalesce(ev#>>'{message,msg_id}',''); sender_name:='Zalo ' || right(coalesce(ext,''),4);
   stamp:=coalesce((ev->>'timestamp')::numeric,extract(epoch from clock_timestamp())*1000);
 else
   if jsonb_typeof(payload)<>'object' or octet_length(payload::text)>60000 then raise exception 'Yêu cầu không hợp lệ'; end if;
   ext:=lower(trim(coalesce(payload->>'from',''))); body:=payload->>'text'; msg_id:=coalesce(payload->>'messageId',''); subject:=left(coalesce(payload->>'subject',''),200);
   sender_name:=coalesce(nullif(trim(payload->>'name'),''),ext); stamp:=extract(epoch from clock_timestamp())*1000;
   if ext !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Email người gửi không hợp lệ'; end if;
   if lower(ext)=lower(coalesce(a.config->>'fromAddress','')) then return jsonb_build_object('ok',true,'ignored',true); end if; -- never loop our own mail back in
 end if;
 body:=left(trim(coalesce(body,'')),3000);
 if ext is null or ext='' or body='' then return jsonb_build_object('ok',true,'ignored',true); end if;
 perform pg_advisory_xact_lock(hashtextextended(a.workspace_id::text,1));
 select * into t from maoki_private.channel_threads where workspace_id=a.workspace_id and platform=a.platform and external_id=ext;
 if t.conversation_id is not null then select * into r from public.maoki_records where id=t.conversation_id and workspace_id=a.workspace_id and resource='conversations'; end if;
 if r.id is not null then
   seen:=coalesce(t.meta->'seen','[]');
   if msg_id<>'' and seen ? msg_id then return jsonb_build_object('ok',true,'duplicate',true); end if;
 end if;
 if r.id is null then
   insert into public.maoki_records(workspace_id,resource,data) values(a.workspace_id,'contacts',maoki_private.validate(a.workspace_id,'contacts',
     jsonb_build_object('name',left(sender_name,120),'source',a.platform) || case when a.platform='email' then jsonb_build_object('email',ext) else '{}'::jsonb end)) returning id into cid;
   r.id:=gen_random_uuid();
   r.data:=maoki_private.validate(a.workspace_id,'conversations',jsonb_build_object('guestName',left(sender_name,120),'platform',a.platform,'contactId',cid,'unread',true))-'initialMessage';
   r.data:=r.data || jsonb_build_object('messages','[]'::jsonb,'lastMessageAt',stamp);
   insert into public.maoki_records(id,workspace_id,resource,data) values(r.id,a.workspace_id,'conversations',r.data);
   insert into maoki_private.channel_threads(workspace_id,platform,external_id,conversation_id) values(a.workspace_id,a.platform,ext,r.id)
     on conflict(workspace_id,platform,external_id) do update set conversation_id=excluded.conversation_id;
   t.meta:='{}'; seen:='[]';
 end if;
 msgs:=(select coalesce(jsonb_agg(value),'[]') from (select value from jsonb_array_elements(r.data->'messages') with ordinality where ordinality>jsonb_array_length(r.data->'messages')-199) q)
   || jsonb_build_array(jsonb_build_object('sender','guest','text',case when subject<>'' and a.platform='email' then '['||subject||'] '||body else body end,'timestamp',stamp));
 update public.maoki_records set data=r.data || jsonb_build_object('messages',msgs,'lastMessageAt',stamp,'unread',true,'status','open'),updated_at=clock_timestamp() where id=r.id;
 update maoki_private.channel_threads set meta=coalesce(t.meta,'{}') || jsonb_build_object('seen',(select coalesce(jsonb_agg(value),'[]') from (select value from jsonb_array_elements(case when msg_id<>'' then coalesce(seen,'[]') || to_jsonb(msg_id) else coalesce(seen,'[]') end) with ordinality where ordinality>jsonb_array_length(case when msg_id<>'' then coalesce(seen,'[]') || to_jsonb(msg_id) else coalesce(seen,'[]') end)-20) s))
   || case when a.platform='email' then jsonb_build_object('lastMessageId',msg_id,'subject',subject) else '{}'::jsonb end
   where workspace_id=a.workspace_id and platform=a.platform and external_id=ext;
 if t.conversation_id is null then perform maoki_private.trigger_rules(a.workspace_id,'new_conversation',r.id); end if;
 return jsonb_build_object('ok',true,'conversationId',r.id);
end;
$$;

create function public.maoki_channel_accounts(op text, payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select maoki_private.channel_accounts_rpc(op,payload) $$;
create function public.maoki_channel_inbound(token text, payload jsonb default '{}', raw text default '', signature text default '') returns jsonb language sql security invoker set search_path='' as $$ select maoki_private.channel_inbound(token,payload,raw,signature) $$;
revoke all on function maoki_private.channel_accounts_rpc(text,jsonb), public.maoki_channel_accounts(text,jsonb), maoki_private.channel_inbound(text,jsonb,text,text), public.maoki_channel_inbound(text,jsonb,text,text) from public,anon,authenticated;
grant execute on function maoki_private.channel_accounts_rpc(text,jsonb), public.maoki_channel_accounts(text,jsonb) to authenticated;
grant execute on function maoki_private.channel_inbound(text,jsonb,text,text), public.maoki_channel_inbound(text,jsonb,text,text) to anon, authenticated;

-- ===== supabase/migrations/20261124090000_maoki_meta_channels.sql =====
-- Facebook Messenger and Instagram direct messages through the Meta Graph API.
-- Reuses channel_accounts / channel_threads; the webhook signature (HMAC-SHA256 with the app secret) is verified in SQL.
alter table maoki_private.channel_accounts drop constraint if exists channel_accounts_platform_check;
alter table maoki_private.channel_accounts add constraint channel_accounts_platform_check check(platform in ('zalo','email','facebook','instagram'));

create function maoki_private.hmac_sha256(key text, msg text) returns text language plpgsql immutable set search_path='' as $$
declare k bytea:=convert_to(key,'UTF8'); ipad bytea; opad bytea; i integer;
begin
 if octet_length(k)>64 then k:=sha256(k); end if;
 k:=k || decode(repeat('00',64-octet_length(k)),'hex');
 ipad:=k; opad:=k;
 for i in 0..63 loop ipad:=set_byte(ipad,i,get_byte(k,i) # 54); opad:=set_byte(opad,i,get_byte(k,i) # 92); end loop;
 return encode(sha256(opad || sha256(ipad || convert_to(msg,'UTF8'))),'hex');
end;
$$;

create or replace function maoki_private.channel_accounts_rpc(op text, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); w uuid; member_role text; a maoki_private.channel_accounts; plat text; cfg jsonb; k text; v jsonb; t maoki_private.channel_threads;
 secrets constant text[]:=array['appSecret','accessToken','refreshToken','smtpPass','resendKey','pageAccessToken'];
 allowed constant jsonb:='{"zalo":["appId","oaId","appSecret","accessToken","refreshToken","tokenExpiresAt"],"email":["provider","fromName","fromAddress","smtpHost","smtpPort","smtpUser","smtpPass","resendKey"],"facebook":["appSecret","pageId","pageAccessToken"],"instagram":["appSecret","pageId","pageAccessToken"]}';
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
   if plat not in ('zalo','email','facebook','instagram') then raise exception 'Kênh không hợp lệ'; end if;
   if jsonb_typeof(coalesce(payload->'config','{}'))<>'object' then raise exception 'Cấu hình không hợp lệ'; end if;
   cfg:='{}';
   for k,v in select * from jsonb_each(coalesce(payload->'config','{}')) loop
     if not (allowed->plat ? k) or jsonb_typeof(v)<>'string' or length(v#>>'{}')>2000 then raise exception 'Cấu hình không hợp lệ: %',k; end if;
     if k=any(secrets) and trim(v#>>'{}')='' then continue; end if; -- blank secret keeps the stored value
     cfg:=cfg || jsonb_build_object(k,trim(v#>>'{}'));
   end loop;
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

-- Store one inbound guest message: find or create the contact, conversation and thread, then append the message.
create function maoki_private.channel_ingest(a maoki_private.channel_accounts, ext text, body text, msg_id text, sender_name text, stamp numeric, subject text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare t maoki_private.channel_threads; r public.maoki_records; cid uuid; msgs jsonb; seen jsonb; fresh boolean:=false;
begin
 body:=left(trim(coalesce(body,'')),3000);
 if ext is null or ext='' or body='' then return jsonb_build_object('ok',true,'ignored',true); end if;
 select * into t from maoki_private.channel_threads where workspace_id=a.workspace_id and platform=a.platform and external_id=ext;
 if t.conversation_id is not null then select * into r from public.maoki_records where id=t.conversation_id and workspace_id=a.workspace_id and resource='conversations'; end if;
 if r.id is not null then
   seen:=coalesce(t.meta->'seen','[]');
   if msg_id<>'' and seen ? msg_id then return jsonb_build_object('ok',true,'duplicate',true); end if;
 end if;
 if r.id is null then
   fresh:=true;
   insert into public.maoki_records(workspace_id,resource,data) values(a.workspace_id,'contacts',maoki_private.validate(a.workspace_id,'contacts',
     jsonb_build_object('name',left(sender_name,120),'source',a.platform) || case when a.platform='email' then jsonb_build_object('email',ext) else '{}'::jsonb end)) returning id into cid;
   r.id:=gen_random_uuid();
   r.data:=maoki_private.validate(a.workspace_id,'conversations',jsonb_build_object('guestName',left(sender_name,120),'platform',a.platform,'contactId',cid,'unread',true))-'initialMessage';
   r.data:=r.data || jsonb_build_object('messages','[]'::jsonb,'lastMessageAt',stamp);
   insert into public.maoki_records(id,workspace_id,resource,data) values(r.id,a.workspace_id,'conversations',r.data);
   insert into maoki_private.channel_threads(workspace_id,platform,external_id,conversation_id) values(a.workspace_id,a.platform,ext,r.id)
     on conflict(workspace_id,platform,external_id) do update set conversation_id=excluded.conversation_id;
   t.meta:='{}'; seen:='[]';
 end if;
 msgs:=(select coalesce(jsonb_agg(value),'[]') from (select value from jsonb_array_elements(r.data->'messages') with ordinality where ordinality>jsonb_array_length(r.data->'messages')-199) q)
   || jsonb_build_array(jsonb_build_object('sender','guest','text',case when subject<>'' and a.platform='email' then '['||subject||'] '||body else body end,'timestamp',stamp));
 update public.maoki_records set data=r.data || jsonb_build_object('messages',msgs,'lastMessageAt',stamp,'unread',true,'status','open'),updated_at=clock_timestamp() where id=r.id;
 seen:=case when msg_id<>'' then coalesce(seen,'[]') || to_jsonb(msg_id) else coalesce(seen,'[]') end;
 update maoki_private.channel_threads set meta=coalesce(t.meta,'{}') || jsonb_build_object('seen',(select coalesce(jsonb_agg(value),'[]') from (select value from jsonb_array_elements(seen) with ordinality where ordinality>jsonb_array_length(seen)-20) s))
   || case when a.platform='email' then jsonb_build_object('lastMessageId',msg_id,'subject',subject) else '{}'::jsonb end
   where workspace_id=a.workspace_id and platform=a.platform and external_id=ext;
 if fresh then perform maoki_private.trigger_rules(a.workspace_id,'new_conversation',r.id); end if;
 return jsonb_build_object('ok',true,'conversationId',r.id);
end;
$$;

create or replace function maoki_private.channel_inbound(token text, payload jsonb default '{}', raw text default '', signature text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare a maoki_private.channel_accounts; ev jsonb; entry jsonb; item jsonb; expected text; out jsonb; done integer:=0; last_id uuid; sender text;
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
 else
   if jsonb_typeof(payload)<>'object' or octet_length(payload::text)>60000 then raise exception 'Yêu cầu không hợp lệ'; end if;
   sender:=lower(trim(coalesce(payload->>'from','')));
   if sender !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Email người gửi không hợp lệ'; end if;
   if sender=lower(coalesce(a.config->>'fromAddress','')) then return jsonb_build_object('ok',true,'ignored',true); end if; -- never loop our own mail back in
   return maoki_private.channel_ingest(a,sender,payload->>'text',coalesce(payload->>'messageId',''),coalesce(nullif(trim(payload->>'name'),''),sender),extract(epoch from clock_timestamp())*1000,left(coalesce(payload->>'subject',''),200));
 end if;
end;
$$;

-- Meta webhook subscription handshake (GET ?hub.verify_token=…): true only for the account's derived verify token.
create function maoki_private.channel_verify(token text, verify text) returns boolean language plpgsql security definer set search_path='' as $$
declare a maoki_private.channel_accounts;
begin
 if token !~ '^[a-f0-9]{64}$' then return false; end if;
 select * into a from maoki_private.channel_accounts where inbound_token=token and enabled and platform in ('facebook','instagram');
 return a.id is not null and verify = left(encode(sha256(convert_to('verify' || a.inbound_token,'UTF8')),'hex'),24);
end;
$$;
create function public.maoki_channel_verify(token text, verify text) returns boolean language sql security invoker set search_path='' as $$ select maoki_private.channel_verify(token,verify) $$;
revoke all on function maoki_private.channel_verify(text,text), public.maoki_channel_verify(text,text), maoki_private.channel_ingest(maoki_private.channel_accounts,text,text,text,text,numeric,text), maoki_private.hmac_sha256(text,text) from public,anon,authenticated;
grant execute on function maoki_private.channel_verify(text,text), public.maoki_channel_verify(text,text) to anon, authenticated;
revoke all on function maoki_private.channel_inbound(text,jsonb,text,text), maoki_private.channel_accounts_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function maoki_private.channel_inbound(text,jsonb,text,text) to anon, authenticated;
grant execute on function maoki_private.channel_accounts_rpc(text,jsonb) to authenticated;

-- ===== supabase/migrations/20261125090000_maoki_whatsapp_tiktok.sql =====
-- WhatsApp Business Cloud API and TikTok (through a bridge). Extends the shared messaging channel tables.
alter table maoki_private.channel_accounts drop constraint if exists channel_accounts_platform_check;
alter table maoki_private.channel_accounts add constraint channel_accounts_platform_check check(platform in ('zalo','email','facebook','instagram','whatsapp','tiktok'));

-- Conversations and contacts may now come from WhatsApp and TikTok.
create or replace function maoki_private.validate(w uuid, kind text, payload jsonb) returns jsonb language plpgsql set search_path='' as $$
declare specs jsonb := '{"properties": {"defaults": {"title": "", "address": "", "description": "", "status": "active", "imageURLs": [], "basePrice": 0, "bedrooms": 1, "capacity": 2, "published": false}, "required": ["title"], "numbers": {"basePrice": [0, 1000000000000.0], "bedrooms": [0, 100], "capacity": [1, 1000]}, "enums": {"status": ["active", "inactive"]}}, "bookings": {"defaults": {"propertyId": "", "guestName": "", "guestEmail": "", "guestPhone": "", "contactId": "", "source": "direct", "checkIn": "", "checkOut": "", "status": "pending", "payoutAmount": 0, "notes": ""}, "required": ["guestName", "propertyId", "checkIn", "checkOut"], "numbers": {"payoutAmount": [0, 1000000000000.0]}, "enums": {"source": ["direct", "airbnb", "booking", "agoda"], "status": ["pending", "confirmed", "cancelled"]}}, "contacts": {"defaults": {"name": "", "email": "", "phone": "", "source": "direct", "stage": "lead", "tags": [], "notes": ""}, "required": ["name"], "enums": {"source": ["direct", "airbnb", "booking", "agoda", "facebook", "instagram", "zalo", "email", "webchat", "whatsapp", "tiktok"], "stage": ["lead", "guest", "returning"]}}, "conversations": {"defaults": {"guestName": "", "platform": "direct", "contactId": "", "assignee": "", "status": "open", "tags": [], "unread": false, "initialMessage": ""}, "required": ["guestName"], "enums": {"platform": ["direct", "airbnb", "booking", "agoda", "facebook", "instagram", "zalo", "email", "webchat", "whatsapp", "tiktok"], "status": ["open", "pending", "closed"]}}, "tasks": {"defaults": {"title": "", "propertyId": "", "assignee": "", "dueDate": "", "status": "todo", "priority": "normal", "type": "cleaning", "notes": ""}, "required": ["title", "dueDate"], "enums": {"status": ["todo", "doing", "done"], "priority": ["normal", "high"], "type": ["cleaning", "maintenance", "checkin"]}}, "rates": {"defaults": {"name": "", "propertyId": "", "startDate": "", "endDate": "", "nightlyRate": 0, "minNights": 1, "closed": false}, "required": ["name", "propertyId", "startDate", "endDate"], "numbers": {"nightlyRate": [0, 1000000000000.0], "minNights": [1, 365]}}, "guidebooks": {"defaults": {"title": "", "propertyId": "", "welcome": "", "checkin": "", "wifiName": "", "wifiPassword": "", "houseRules": "", "recommendations": "", "published": false}, "required": ["title", "propertyId"]}, "owners": {"defaults": {"name": "", "email": "", "phone": "", "propertyIds": [], "commissionRate": 15}, "required": ["name"], "numbers": {"commissionRate": [0, 100]}}, "automations": {"defaults": {"name": "", "trigger": "new_conversation", "action": "create_task", "content": "", "enabled": true}, "required": ["name", "content"], "enums": {"trigger": ["new_conversation", "booking_confirmed", "before_checkin"], "action": ["send_reply", "create_task", "add_tag"]}}, "campaigns": {"defaults": {"name": "", "channel": "email", "audienceTag": "", "subject": "", "content": "", "status": "draft", "scheduledAt": ""}, "required": ["name", "subject", "content"], "enums": {"channel": ["email", "zalo", "facebook"], "status": ["draft", "scheduled"]}}, "replies": {"defaults": {"title": "", "content": ""}, "required": ["title", "content"]}, "integrations": {"defaults": {"platform": "direct", "label": "", "status": "disconnected"}, "required": ["label"], "enums": {"platform": ["direct", "airbnb", "booking", "agoda", "facebook", "instagram", "zalo", "email", "webchat", "whatsapp", "tiktok"], "status": ["disconnected"]}}, "employees": {"defaults": {"name": "", "role": "", "email": "", "phone": "", "status": "active"}, "required": ["name", "role"], "enums": {"status": ["active", "inactive"]}}, "revenue": {"defaults": {"propertyId": "", "type": "expense", "amount": 0, "description": "", "date": ""}, "required": ["description", "date"], "numbers": {"amount": [-1000000000000.0, 1000000000000.0]}, "enums": {"type": ["booking_payout", "expense", "adjustment"]}}}'::jsonb; spec jsonb; result jsonb; k text; v jsonb; required_key text; ref_id text;
begin
 spec:=specs->kind;
 if spec is null or jsonb_typeof(payload) <> 'object' or length(payload::text)>100000 then raise exception 'Dữ liệu không hợp lệ'; end if;
 for k,v in select * from jsonb_each(payload) loop
   if not (spec->'defaults' ? k) then raise exception 'Trường không được phép: %', k; end if;
   if jsonb_typeof(v) <> jsonb_typeof(spec->'defaults'->k) then raise exception 'Kiểu dữ liệu không hợp lệ: %', k; end if;
   if jsonb_typeof(v)='string' and length(v#>>'{}')>10000 then raise exception 'Nội dung quá dài: %',k; end if;
   if jsonb_typeof(v)='array' and jsonb_array_length(v)>100 then raise exception 'Danh sách quá dài: %',k; end if;
 end loop;
 result:=spec->'defaults' || payload;
 for required_key in select jsonb_array_elements_text(spec->'required') loop
   if length(trim(result->>required_key))=0 then raise exception 'Vui lòng nhập: %',required_key; end if;
 end loop;
 for k,v in select * from jsonb_each(coalesce(spec->'numbers','{}')) loop
   if (result->>k)::numeric < (v->>0)::numeric or (result->>k)::numeric > (v->>1)::numeric then raise exception 'Số không hợp lệ: %',k; end if;
 end loop;
 for k,v in select * from jsonb_each(coalesce(spec->'enums','{}')) loop
   if not (v ? (result->>k)) then raise exception 'Giá trị không hợp lệ: %',k; end if;
 end loop;
 foreach k in array array['name','title','guestName','subject','role','description'] loop
   if k <> 'description' and length(result->>k)>150 then raise exception 'Tên quá dài'; end if;
 end loop;
 foreach k in array array['checkIn','checkOut','startDate','endDate','dueDate','date'] loop
   if result ? k then
     if result->>k !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Ngày không hợp lệ'; end if;
     perform (result->>k)::date;
   end if;
 end loop;
 if kind='bookings' and (result->>'checkOut')::date <= (result->>'checkIn')::date then raise exception 'Ngày trả phòng phải sau ngày nhận phòng'; end if;
 if kind='rates' and (result->>'endDate')::date < (result->>'startDate')::date then raise exception 'Khoảng ngày không hợp lệ'; end if;
 foreach k in array array['bedrooms','capacity','minNights'] loop
   if result ? k and mod((result->>k)::numeric,1)<>0 then raise exception 'Vui lòng nhập số nguyên: %',k; end if;
 end loop;
 if kind='automations' and ((result->>'trigger'='new_conversation' and result->>'action'='create_task') or (result->>'trigger'<>'new_conversation' and result->>'action'<>'create_task')) then raise exception 'Hội thoại mới dùng trả lời/gắn nhãn; sự kiện đặt phòng dùng tạo công việc'; end if;
 if kind='campaigns' and coalesce(result->>'scheduledAt','')<>'' then perform (result->>'scheduledAt')::timestamp; end if;
 if kind='campaigns' and result->>'status'='scheduled' and coalesce(result->>'scheduledAt','')='' then raise exception 'Vui lòng chọn lịch dự kiến'; end if;
 if kind='revenue' and result->>'type'<>'adjustment' and (result->>'amount')::numeric < 0 then raise exception 'Nhập số tiền dương cho khoản thu/chi'; end if;
 foreach k in array array['email','guestEmail'] loop
   if coalesce(result->>k,'')<>'' and result->>k !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Email không hợp lệ'; end if;
 end loop;
 foreach k in array array['tags','imageURLs','propertyIds'] loop
   if result ? k then
     for v in select jsonb_array_elements(result->k) loop
       if jsonb_typeof(v)<>'string' or length(v#>>'{}')>2000 then raise exception 'Danh sách không hợp lệ'; end if;
       if k='imageURLs' and v#>>'{}' !~ '^(https://|/)' then raise exception 'Ảnh phải dùng HTTPS'; end if;
       if k='propertyIds' and not exists(select 1 from public.maoki_records where workspace_id=w and resource='properties' and id::text=v#>>'{}') then raise exception 'Không tìm thấy phòng'; end if;
     end loop;
   end if;
 end loop;
 foreach k in array array['propertyId','contactId'] loop
   ref_id:=result->>k;
   if coalesce(ref_id,'')<>'' and not exists(select 1 from public.maoki_records where workspace_id=w and id::text=ref_id and resource=case when k='propertyId' then 'properties' else 'contacts' end) then raise exception 'Không tìm thấy bản ghi liên quan'; end if;
 end loop;
 return result;
end;
$$;

create or replace function maoki_private.channel_accounts_rpc(op text, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); w uuid; member_role text; a maoki_private.channel_accounts; plat text; cfg jsonb; k text; v jsonb; t maoki_private.channel_threads;
 secrets constant text[]:=array['appSecret','accessToken','refreshToken','smtpPass','resendKey','pageAccessToken','outboundToken'];
 allowed constant jsonb:='{"zalo":["appId","oaId","appSecret","accessToken","refreshToken","tokenExpiresAt"],"email":["provider","fromName","fromAddress","smtpHost","smtpPort","smtpUser","smtpPass","resendKey"],"facebook":["appSecret","pageId","pageAccessToken"],"instagram":["appSecret","pageId","pageAccessToken"],"whatsapp":["appSecret","phoneNumberId","accessToken"],"tiktok":["outboundUrl","outboundToken","label"]}';
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
   if plat not in ('zalo','email','facebook','instagram','whatsapp','tiktok') then raise exception 'Kênh không hợp lệ'; end if;
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

-- Meta webhook subscription handshake (GET ?hub.verify_token=…): true only for the account's derived verify token.
create or replace function maoki_private.channel_verify(token text, verify text) returns boolean language plpgsql security definer set search_path='' as $$
declare a maoki_private.channel_accounts;
begin
 if token !~ '^[a-f0-9]{64}$' then return false; end if;
 select * into a from maoki_private.channel_accounts where inbound_token=token and enabled and platform in ('facebook','instagram','whatsapp');
 return a.id is not null and verify = left(encode(sha256(convert_to('verify' || a.inbound_token,'UTF8')),'hex'),24);
end;
$$;
create or replace function public.maoki_channel_verify(token text, verify text) returns boolean language sql security invoker set search_path='' as $$ select maoki_private.channel_verify(token,verify) $$;
revoke all on function maoki_private.channel_verify(text,text), public.maoki_channel_verify(text,text), maoki_private.channel_ingest(maoki_private.channel_accounts,text,text,text,text,numeric,text), maoki_private.hmac_sha256(text,text) from public,anon,authenticated;
grant execute on function maoki_private.channel_verify(text,text), public.maoki_channel_verify(text,text) to anon, authenticated;
revoke all on function maoki_private.channel_inbound(text,jsonb,text,text), maoki_private.channel_accounts_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function maoki_private.channel_inbound(text,jsonb,text,text) to anon, authenticated;
grant execute on function maoki_private.channel_accounts_rpc(text,jsonb) to authenticated;

-- Routing rules and bots can target the new channels.
create or replace function maoki_private.extras(op text,kind text default '',record_id uuid default null,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); w uuid; member_role text; r public.maoki_records; d jsonb; k text; v jsonb; spec jsonb; result jsonb;
 kinds constant text[]:=array['tags','rules','hours','reminders','ticketTypes','tickets','bots','journeys','customFields','fieldValues','popups','products','orders','webhooks','agentGroups','knowledge'];
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
  "knowledge":{"defaults":{"title":"","content":"","active":true},"required":["title","content"]}
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
 if member_role='viewer' or (member_role='agent' and kind not in ('reminders','tickets')) then raise exception 'Bạn không có quyền thực hiện thao tác này'; end if;
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

-- ===== supabase/migrations/20261126090000_maoki_calls_reviews.sql =====
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

-- ===== supabase/migrations/20261127090000_maoki_youtube.sql =====
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

-- ===== supabase/migrations/20261128090000_maoki_background_automation.sql =====
-- Background automation: routing rules, bots, journeys, outbound queue and the worker interface (see docs/plans/2026-11-23-background-automation-design.md).

create table maoki_private.outbound_queue (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.maoki_workspaces(id) on delete cascade,
 platform text not null check(platform in ('zalo','email','facebook','instagram','whatsapp','tiktok')),
 external_id text not null check(length(external_id)<=320),
 conversation_id uuid,
 text text not null check(length(text) between 1 and 3000),
 kind text not null default 'bot' check(kind in ('bot','automation','journey')),
 status text not null default 'pending' check(status in ('pending','sending','sent','failed')),
 attempts integer not null default 0,
 last_error text not null default '',
 run_after timestamptz not null default now(),
 claimed_at timestamptz,
 created_at timestamptz not null default now()
);
create index maoki_outbound_queue_due on maoki_private.outbound_queue(status,run_after);
create table maoki_private.journey_runs (
 journey_id uuid not null, instance_key text not null, step_idx integer not null, created_at timestamptz not null default now(),
 primary key(journey_id,instance_key,step_idx)
);
alter table maoki_private.outbound_queue enable row level security; alter table maoki_private.journey_runs enable row level security;
revoke all on maoki_private.outbound_queue, maoki_private.journey_runs from public,anon,authenticated;

create function maoki_private.enqueue(w uuid, plat text, ext text, conv uuid, body text, kind text) returns void language sql security definer set search_path='' as $$
 insert into maoki_private.outbound_queue(workspace_id,platform,external_id,conversation_id,text,kind) values(w,plat,ext,conv,left(body,3000),kind);
$$;

-- Working hours in the workspace timezone. No schedule at all means "always open".
create function maoki_private.in_work_hours(w uuid, at timestamptz default now()) returns boolean language plpgsql stable security definer set search_path='' as $$
declare tz text; local_ts timestamp; dow integer; hhmm text; r record; names text[];
begin
 select coalesce(settings->>'timezone','Asia/Ho_Chi_Minh') into tz from public.maoki_workspaces where id=w;
 local_ts:=at at time zone coalesce(tz,'Asia/Ho_Chi_Minh');
 if exists(select 1 from public.maoki_records where workspace_id=w and resource='hours' and data->>'kind'='holiday' and data->>'holidayDate'=local_ts::date::text) then return false; end if;
 if not exists(select 1 from public.maoki_records where workspace_id=w and resource='hours' and data->>'kind'='work') then return true; end if;
 dow:=extract(isodow from local_ts)::integer; hhmm:=to_char(local_ts,'HH24:MI');
 names:=case dow when 1 then array['t2','mon','monday','thứ 2','thứ hai'] when 2 then array['t3','tue','tuesday','thứ 3','thứ ba'] when 3 then array['t4','wed','wednesday','thứ 4','thứ tư']
   when 4 then array['t5','thu','thursday','thứ 5','thứ năm'] when 5 then array['t6','fri','friday','thứ 6','thứ sáu'] when 6 then array['t7','sat','saturday','thứ 7','thứ bảy'] else array['cn','sun','sunday','chủ nhật'] end;
 for r in select data from public.maoki_records where workspace_id=w and resource='hours' and data->>'kind'='work' loop
   if (jsonb_array_length(coalesce(r.data->'days','[]'))=0 or exists(select 1 from jsonb_array_elements_text(r.data->'days') x where lower(trim(x))=any(names)))
      and hhmm>=coalesce(r.data->>'start','00:00') and hhmm<coalesce(r.data->>'end','23:59') then return true; end if;
 end loop;
 return false;
end;
$$;

create function maoki_private.route_conversation(w uuid, plat text, at timestamptz) returns text language plpgsql stable security definer set search_path='' as $$
declare inh boolean:=maoki_private.in_work_hours(w,at); who text;
begin
 select data->>'assignee' into who from public.maoki_records where workspace_id=w and resource='rules' and data->>'active'='true' and data->>'channel' in ('all',plat) and coalesce(data->>'assignee','')<>''
   and (data->>'mode'='all' or (data->>'mode'='work_hours' and inh) or (data->>'mode'='off_hours' and not inh)) order by created_at limit 1;
 return coalesce(who,'');
end;
$$;

-- First matching active bot for an inbound message: new conversation, outside working hours (6h cooldown per guest) or keyword.
create function maoki_private.pick_bot(w uuid, plat text, fresh boolean, body text, meta jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare b record; inh boolean:=maoki_private.in_work_hours(w,now()); text_out text; last_ms numeric:=coalesce((meta->>'botOffHoursAt')::numeric,0);
begin
 for b in select data from public.maoki_records where workspace_id=w and resource='bots' and data->>'active'='true' and data->>'channel' in ('all',plat) order by created_at loop
   if (b.data->>'trigger'='new_conversation' and fresh)
      or (b.data->>'trigger'='outside_hours' and not inh and extract(epoch from clock_timestamp())*1000-last_ms>6*3600*1000)
      or (b.data->>'trigger'='keyword' and coalesce(b.data->>'keyword','')<>'' and position(lower(b.data->>'keyword') in lower(body))>0) then
     text_out:=b.data->>'message';
     if coalesce(trim(b.data->>'replies'),'')<>'' then text_out:=text_out || E'\n\n' || (select string_agg('• ' || trim(line),E'\n') from regexp_split_to_table(b.data->>'replies',E'\n') line where trim(line)<>''); end if;
     return jsonb_build_object('text',left(text_out,3000),'trigger',b.data->>'trigger');
   end if;
 end loop;
 return null;
end;
$$;

-- Scheduled journeys: create each due step exactly once and queue it for delivery.
create function maoki_private.journey_tick() returns jsonb language plpgsql security definer set search_path='' as $$
declare j record; st record; b record; c record; conv record; tz text; ci text; co text; base timestamptz; due timestamptz; mins integer; sign integer; key text; ext text; msg text; queued integer:=0; th maoki_private.channel_threads; email_on boolean; who text;
begin
 for j in select id,workspace_id,data from public.maoki_records where resource='journeys' and data->>'status'='active' loop
   select coalesce(settings->>'timezone','Asia/Ho_Chi_Minh'),coalesce(settings->>'checkinTime','14:00'),coalesce(settings->>'checkoutTime','12:00') into tz,ci,co from public.maoki_workspaces where id=j.workspace_id;
   select exists(select 1 from maoki_private.channel_accounts where workspace_id=j.workspace_id and platform='email' and enabled) into email_on;
   for st in select q.idx,lower(q.m[1]) dir,q.m[2]::integer n,lower(q.m[3]) unit,trim(q.m[4]) body from (select ord::integer idx,regexp_match(line,'^\s*(sau|after|trước|truoc|before)\s+(\d+)\s*(phút|phut|min\w*|giờ|gio|hours?|h|ngày|ngay|days?|d)\s*[:：-]\s*(.+)$','i') m from regexp_split_to_table(j.data->>'steps',E'\n') with ordinality t(line,ord)) q where q.m is not null loop
     mins:=st.n*(case when st.unit ~ '^(phút|phut|min)' then 1 when st.unit ~ '^(giờ|gio|h)' then 60 else 1440 end);
     sign:=case when st.dir in ('trước','truoc','before') then -1 else 1 end;
     if j.data->>'trigger' in ('booking_confirmed','before_checkin','after_checkout') then
       if sign<0 and j.data->>'trigger'<>'before_checkin' then continue; end if;
       continue when not email_on;
       for b in select id,data,created_at from public.maoki_records where workspace_id=j.workspace_id and resource='bookings' and data->>'status'='confirmed' and coalesce(data->>'guestEmail','')<>'' loop
         base:=case j.data->>'trigger' when 'booking_confirmed' then b.created_at when 'before_checkin' then ((b.data->>'checkIn')||' '||ci)::timestamp at time zone tz else ((b.data->>'checkOut')||' '||co)::timestamp at time zone tz end;
         due:=base+sign*mins*interval '1 minute';
         if due<=now() and due>now()-interval '2 days' then
           insert into maoki_private.journey_runs(journey_id,instance_key,step_idx) values(j.id,b.id::text,st.idx) on conflict do nothing;
           if found then perform maoki_private.enqueue(j.workspace_id,'email',lower(b.data->>'guestEmail'),null,replace(st.body,'{{guest}}',coalesce(b.data->>'guestName','')),'journey'); queued:=queued+1; end if;
         end if;
       end loop;
     elsif j.data->>'trigger'='new_contact' and sign>0 then
       for c in select id,data,created_at from public.maoki_records where workspace_id=j.workspace_id and resource='contacts' and created_at>now()-interval '30 days' loop
         due:=c.created_at+mins*interval '1 minute';
         if due<=now() and due>now()-interval '2 days' then
           select t.* into th from maoki_private.channel_threads t join public.maoki_records v on v.id=t.conversation_id and v.workspace_id=t.workspace_id where t.workspace_id=j.workspace_id and v.data->>'contactId'=c.id::text limit 1;
           if th.conversation_id is not null then
             insert into maoki_private.journey_runs(journey_id,instance_key,step_idx) values(j.id,c.id::text,st.idx) on conflict do nothing;
             if found then perform maoki_private.enqueue(j.workspace_id,th.platform,th.external_id,th.conversation_id,replace(st.body,'{{guest}}',coalesce(c.data->>'name','')),'journey'); queued:=queued+1; end if;
           end if;
         end if;
       end loop;
     elsif j.data->>'trigger'='no_reply' and sign>0 then
       for conv in select id,data from public.maoki_records where workspace_id=j.workspace_id and resource='conversations' and data->'messages'->-1->>'sender'='host' and data->>'status'<>'closed' loop
         base:=to_timestamp((conv.data->'messages'->-1->>'timestamp')::numeric/1000); due:=base+mins*interval '1 minute';
         if due<=now() and due>now()-interval '2 days' then
           select t.* into th from maoki_private.channel_threads t where t.workspace_id=j.workspace_id and t.conversation_id=conv.id limit 1;
           if th.conversation_id is not null then
             key:=conv.id::text || ':' || (conv.data->'messages'->-1->>'timestamp');
             insert into maoki_private.journey_runs(journey_id,instance_key,step_idx) values(j.id,key,st.idx) on conflict do nothing;
             if found then perform maoki_private.enqueue(j.workspace_id,th.platform,th.external_id,conv.id,replace(st.body,'{{guest}}',coalesce(conv.data->>'guestName','')),'journey'); queued:=queued+1; end if;
           end if;
         end if;
       end loop;
     end if;
   end loop;
 end loop;
 return jsonb_build_object('queued',queued);
end;
$$;

-- Worker interface: only the service role (the Vercel worker) can call these.
create function maoki_private.worker_claim(batch integer default 20) returns jsonb language plpgsql security definer set search_path='' as $$
declare out jsonb;
begin
 update maoki_private.outbound_queue set status='pending' where status='sending' and claimed_at<now()-interval '10 minutes';
 with c as (select id from maoki_private.outbound_queue where status='pending' and run_after<=now() order by created_at limit least(greatest(batch,1),50) for update skip locked),
 u as (update maoki_private.outbound_queue q set status='sending',attempts=q.attempts+1,claimed_at=now() from c where q.id=c.id returning q.*)
 select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'workspaceId',u.workspace_id,'platform',u.platform,'externalId',u.external_id,'conversationId',u.conversation_id,'text',u.text,'attempts',u.attempts,
   'config',coalesce((select ca.config from maoki_private.channel_accounts ca where ca.workspace_id=u.workspace_id and ca.platform=u.platform and ca.enabled),'{}'),
   'meta',coalesce((select th.meta from maoki_private.channel_threads th where th.workspace_id=u.workspace_id and th.platform=u.platform and th.external_id=u.external_id),'{}'))),'[]') into out from u;
 return out;
end;
$$;
create function maoki_private.worker_done(job uuid, ok boolean, err text default '') returns void language plpgsql security definer set search_path='' as $$
begin
 update maoki_private.outbound_queue set status=case when ok then 'sent' when attempts>=3 then 'failed' else 'pending' end,last_error=case when ok then '' else left(coalesce(err,''),300) end,
   run_after=case when ok or attempts>=3 then run_after else now()+attempts*interval '5 minutes' end where id=job;
end;
$$;
create function maoki_private.worker_tokens(w uuid, tokens jsonb) returns void language sql security definer set search_path='' as $$
 update maoki_private.channel_accounts set config=config || jsonb_strip_nulls(jsonb_build_object('accessToken',tokens->>'accessToken','refreshToken',tokens->>'refreshToken','tokenExpiresAt',tokens->>'tokenExpiresAt')),updated_at=now() where workspace_id=w and platform='zalo';
$$;
create function maoki_private.worker_email_accounts() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('workspaceId',workspace_id,'token',inbound_token,'config',config)),'[]') from maoki_private.channel_accounts where platform='email' and enabled and coalesce(config->>'imapHost','')<>'';
$$;
create function maoki_private.worker_review_candidates() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('recordId',r.id,'workspaceId',r.workspace_id,'reviewName',r.data->>'reviewName','text',replace(a.config->>'autoReplyText','{{guest}}',coalesce(r.data->>'reviewer','')),'config',a.config)),'[]')
 from (select * from maoki_private.channel_accounts where platform='google' and enabled and coalesce(config->>'autoReplyMinRating','') ~ '^[1-5]$' and coalesce(config->>'autoReplyText','')<>'') a
 join lateral (select * from public.maoki_records x where x.workspace_id=a.workspace_id and x.resource='reviews' and x.data->>'status'='new' and coalesce(x.data->>'reply','')='' and (x.data->>'rating')::integer>=(a.config->>'autoReplyMinRating')::integer order by x.created_at limit 10) r on true;
$$;
create function maoki_private.worker_review_replied(rec uuid, reply_text text) returns void language sql security definer set search_path='' as $$
 update public.maoki_records set data=data || jsonb_build_object('reply',left(reply_text,4000),'repliedAt',to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'status','replied'),updated_at=clock_timestamp() where id=rec and resource='reviews';
$$;
create function public.maoki_worker_tick() returns jsonb language sql security invoker set search_path='' as $$ select maoki_private.journey_tick() $$;
create function public.maoki_worker_claim(batch integer default 20) returns jsonb language sql security invoker set search_path='' as $$ select maoki_private.worker_claim(batch) $$;
create function public.maoki_worker_done(job uuid, ok boolean, err text default '') returns void language sql security invoker set search_path='' as $$ select maoki_private.worker_done(job,ok,err) $$;
create function public.maoki_worker_tokens(w uuid, tokens jsonb) returns void language sql security invoker set search_path='' as $$ select maoki_private.worker_tokens(w,tokens) $$;
create function public.maoki_worker_email_accounts() returns jsonb language sql security invoker set search_path='' as $$ select maoki_private.worker_email_accounts() $$;
create function public.maoki_worker_review_candidates() returns jsonb language sql security invoker set search_path='' as $$ select maoki_private.worker_review_candidates() $$;
create function public.maoki_worker_review_replied(rec uuid, reply_text text) returns void language sql security invoker set search_path='' as $$ select maoki_private.worker_review_replied(rec,reply_text) $$;
revoke all on function maoki_private.enqueue(uuid,text,text,uuid,text,text), maoki_private.in_work_hours(uuid,timestamptz), maoki_private.route_conversation(uuid,text,timestamptz), maoki_private.pick_bot(uuid,text,boolean,text,jsonb), maoki_private.journey_tick(),
  maoki_private.worker_claim(integer), maoki_private.worker_done(uuid,boolean,text), maoki_private.worker_tokens(uuid,jsonb), maoki_private.worker_email_accounts(), maoki_private.worker_review_candidates(), maoki_private.worker_review_replied(uuid,text),
  public.maoki_worker_tick(), public.maoki_worker_claim(integer), public.maoki_worker_done(uuid,boolean,text), public.maoki_worker_tokens(uuid,jsonb), public.maoki_worker_email_accounts(), public.maoki_worker_review_candidates(), public.maoki_worker_review_replied(uuid,text),
  maoki_private.channel_ingest(maoki_private.channel_accounts,text,text,text,text,numeric,text), maoki_private.channel_accounts_rpc(text,jsonb) from public,anon,authenticated;
grant usage on schema maoki_private to service_role;
grant execute on function maoki_private.journey_tick(), maoki_private.worker_claim(integer), maoki_private.worker_done(uuid,boolean,text), maoki_private.worker_tokens(uuid,jsonb), maoki_private.worker_email_accounts(), maoki_private.worker_review_candidates(), maoki_private.worker_review_replied(uuid,text),
  public.maoki_worker_tick(), public.maoki_worker_claim(integer), public.maoki_worker_done(uuid,boolean,text), public.maoki_worker_tokens(uuid,jsonb), public.maoki_worker_email_accounts(), public.maoki_worker_review_candidates(), public.maoki_worker_review_replied(uuid,text) to service_role;
grant execute on function maoki_private.channel_accounts_rpc(text,jsonb) to authenticated;

-- Store one inbound guest message: find or create the contact, conversation and thread, then append the message.
create or replace function maoki_private.channel_ingest(a maoki_private.channel_accounts, ext text, body text, msg_id text, sender_name text, stamp numeric, subject text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare t maoki_private.channel_threads; r public.maoki_records; cid uuid; msgs jsonb; seen jsonb; fresh boolean:=false; assign text; before_n integer; cur jsonb; idx integer; got_reply boolean:=false; bot jsonb; now_ms numeric:=extract(epoch from clock_timestamp())*1000;
begin
 body:=left(trim(coalesce(body,'')),3000);
 if ext is null or ext='' or body='' then return jsonb_build_object('ok',true,'ignored',true); end if;
 select * into t from maoki_private.channel_threads where workspace_id=a.workspace_id and platform=a.platform and external_id=ext;
 if t.conversation_id is not null then select * into r from public.maoki_records where id=t.conversation_id and workspace_id=a.workspace_id and resource='conversations'; end if;
 if r.id is not null then
   seen:=coalesce(t.meta->'seen','[]');
   if msg_id<>'' and seen ? msg_id then return jsonb_build_object('ok',true,'duplicate',true); end if;
 end if;
 if r.id is null then
   fresh:=true;
   insert into public.maoki_records(workspace_id,resource,data) values(a.workspace_id,'contacts',maoki_private.validate(a.workspace_id,'contacts',
     jsonb_build_object('name',left(sender_name,120),'source',a.platform) || case when a.platform='email' then jsonb_build_object('email',ext) else '{}'::jsonb end)) returning id into cid;
   r.id:=gen_random_uuid();
   r.data:=maoki_private.validate(a.workspace_id,'conversations',jsonb_build_object('guestName',left(sender_name,120),'platform',a.platform,'contactId',cid,'unread',true))-'initialMessage';
   r.data:=r.data || jsonb_build_object('messages','[]'::jsonb,'lastMessageAt',stamp);
   insert into public.maoki_records(id,workspace_id,resource,data) values(r.id,a.workspace_id,'conversations',r.data);
   insert into maoki_private.channel_threads(workspace_id,platform,external_id,conversation_id) values(a.workspace_id,a.platform,ext,r.id)
     on conflict(workspace_id,platform,external_id) do update set conversation_id=excluded.conversation_id;
   t.meta:='{}'; seen:='[]';
 end if;
 msgs:=(select coalesce(jsonb_agg(value),'[]') from (select value from jsonb_array_elements(r.data->'messages') with ordinality where ordinality>jsonb_array_length(r.data->'messages')-199) q)
   || jsonb_build_array(jsonb_build_object('sender','guest','text',case when subject<>'' and a.platform='email' then '['||subject||'] '||body else body end,'timestamp',stamp));
 update public.maoki_records set data=r.data || jsonb_build_object('messages',msgs,'lastMessageAt',stamp,'unread',true,'status','open'),updated_at=clock_timestamp() where id=r.id;
 seen:=case when msg_id<>'' then coalesce(seen,'[]') || to_jsonb(msg_id) else coalesce(seen,'[]') end;
 update maoki_private.channel_threads set meta=coalesce(t.meta,'{}') || jsonb_build_object('seen',(select coalesce(jsonb_agg(value),'[]') from (select value from jsonb_array_elements(seen) with ordinality where ordinality>jsonb_array_length(seen)-20) s))
   || case when a.platform='email' then jsonb_build_object('lastMessageId',msg_id,'subject',subject) else '{}'::jsonb end
   where workspace_id=a.workspace_id and platform=a.platform and external_id=ext;
 if fresh then
   -- Routing rules pick the assignee for a new conversation.
   assign:=maoki_private.route_conversation(a.workspace_id,a.platform,now());
   if assign<>'' then update public.maoki_records set data=data || jsonb_build_object('assignee',assign) where id=r.id; end if;
   -- Existing automations run first; whatever host replies they saved are also delivered to the guest.
   before_n:=jsonb_array_length(msgs);
   perform maoki_private.trigger_rules(a.workspace_id,'new_conversation',r.id);
   select data into cur from public.maoki_records where id=r.id;
   for idx in before_n..jsonb_array_length(cur->'messages')-1 loop
     if cur->'messages'->idx->>'sender'='host' then perform maoki_private.enqueue(a.workspace_id,a.platform,ext,r.id,cur->'messages'->idx->>'text','automation'); got_reply:=true; end if;
   end loop;
 end if;
 if not got_reply then
   bot:=maoki_private.pick_bot(a.workspace_id,a.platform,fresh,body,coalesce(t.meta,'{}'));
   if bot is not null then
     update public.maoki_records set data=data || jsonb_build_object('messages',(data->'messages') || jsonb_build_array(jsonb_build_object('sender','host','text',bot->>'text','timestamp',now_ms,'delivery','bot')),'lastMessageAt',now_ms) where id=r.id;
     perform maoki_private.enqueue(a.workspace_id,a.platform,ext,r.id,bot->>'text','bot');
     if bot->>'trigger'='outside_hours' then update maoki_private.channel_threads set meta=meta || jsonb_build_object('botOffHoursAt',now_ms) where workspace_id=a.workspace_id and platform=a.platform and external_id=ext; end if;
   end if;
 end if;
 return jsonb_build_object('ok',true,'conversationId',r.id);
end;
$$;


create or replace function maoki_private.channel_accounts_rpc(op text, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); w uuid; member_role text; a maoki_private.channel_accounts; plat text; cfg jsonb; k text; v jsonb; t maoki_private.channel_threads;
 secrets constant text[]:=array['appSecret','accessToken','refreshToken','smtpPass','resendKey','pageAccessToken','outboundToken','clientSecret','imapPass'];
 allowed constant jsonb:='{"zalo":["appId","oaId","appSecret","accessToken","refreshToken","tokenExpiresAt"],"email":["provider","fromName","fromAddress","smtpHost","smtpPort","smtpUser","smtpPass","resendKey","imapHost","imapPort","imapUser","imapPass"],"facebook":["appSecret","pageId","pageAccessToken"],"instagram":["appSecret","pageId","pageAccessToken"],"whatsapp":["appSecret","phoneNumberId","accessToken","templateName","templateLang"],"tiktok":["outboundUrl","outboundToken","label"],"phone":["hotline","provider"],"google":["clientId","clientSecret","refreshToken","accountId","locationId","autoReplyMinRating","autoReplyText"],"youtube":["clientId","clientSecret","refreshToken","channelId"]}';
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
   if cfg ? 'imapPort' and cfg->>'imapPort' <> '' and cfg->>'imapPort' !~ '^\d{2,5}$' then raise exception 'Cổng IMAP không hợp lệ'; end if;
   if cfg ? 'autoReplyMinRating' and cfg->>'autoReplyMinRating' <> '' and cfg->>'autoReplyMinRating' !~ '^[1-5]$' then raise exception 'Ngưỡng số sao phải từ 1 đến 5'; end if;
   if cfg ? 'templateLang' and cfg->>'templateLang' <> '' and cfg->>'templateLang' !~ '^[a-z]{2}(_[A-Z]{2})?$' then raise exception 'Mã ngôn ngữ template không hợp lệ (ví dụ vi hoặc en_US)'; end if;
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
 elsif op='queue' then
   return jsonb_build_object('counts',(select coalesce(jsonb_object_agg(status,n),'{}') from (select status,count(*) n from maoki_private.outbound_queue where workspace_id=w and created_at>now()-interval '7 days' group by status) q),
     'errors',(select coalesce(jsonb_agg(jsonb_build_object('platform',platform,'kind',kind,'error',last_error,'at',created_at) order by created_at desc),'[]') from (select * from maoki_private.outbound_queue where workspace_id=w and status='failed' order by created_at desc limit 5) e));
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


grant execute on function maoki_private.channel_inbound(text,jsonb,text,text), public.maoki_channel_inbound(text,jsonb,text,text) to service_role;

-- ===== supabase/migrations/20261129090000_maoki_plans.sql =====
-- Service plans: basic (no channels), operations (calendar sync) and professional (shared inbox, bots, AI).
-- Existing and new workspaces start on "professional" during the beta; billing will change this value.
alter table public.maoki_workspaces add column if not exists plan text not null default 'professional';
alter table public.maoki_workspaces drop constraint if exists maoki_workspaces_plan_check;
alter table public.maoki_workspaces add constraint maoki_workspaces_plan_check check(plan in ('basic','operations','professional'));

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
   return result || jsonb_build_object('plan',(select plan from public.maoki_workspaces where id=w));
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
 secrets constant text[]:=array['appSecret','accessToken','refreshToken','smtpPass','resendKey','pageAccessToken','outboundToken','clientSecret','imapPass'];
 allowed constant jsonb:='{"zalo":["appId","oaId","appSecret","accessToken","refreshToken","tokenExpiresAt"],"email":["provider","fromName","fromAddress","smtpHost","smtpPort","smtpUser","smtpPass","resendKey","imapHost","imapPort","imapUser","imapPass"],"facebook":["appSecret","pageId","pageAccessToken"],"instagram":["appSecret","pageId","pageAccessToken"],"whatsapp":["appSecret","phoneNumberId","accessToken","templateName","templateLang"],"tiktok":["outboundUrl","outboundToken","label"],"phone":["hotline","provider"],"google":["clientId","clientSecret","refreshToken","accountId","locationId","autoReplyMinRating","autoReplyText"],"youtube":["clientId","clientSecret","refreshToken","channelId"]}';
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
   if (select plan from public.maoki_workspaces where id=w)<>'professional' then raise exception 'Kênh nhắn tin chỉ có từ gói Chuyên nghiệp'; end if;
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
   if cfg ? 'imapPort' and cfg->>'imapPort' <> '' and cfg->>'imapPort' !~ '^\d{2,5}$' then raise exception 'Cổng IMAP không hợp lệ'; end if;
   if cfg ? 'autoReplyMinRating' and cfg->>'autoReplyMinRating' <> '' and cfg->>'autoReplyMinRating' !~ '^[1-5]$' then raise exception 'Ngưỡng số sao phải từ 1 đến 5'; end if;
   if cfg ? 'templateLang' and cfg->>'templateLang' <> '' and cfg->>'templateLang' !~ '^[a-z]{2}(_[A-Z]{2})?$' then raise exception 'Mã ngôn ngữ template không hợp lệ (ví dụ vi hoặc en_US)'; end if;
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
 elsif op='queue' then
   return jsonb_build_object('counts',(select coalesce(jsonb_object_agg(status,n),'{}') from (select status,count(*) n from maoki_private.outbound_queue where workspace_id=w and created_at>now()-interval '7 days' group by status) q),
     'errors',(select coalesce(jsonb_agg(jsonb_build_object('platform',platform,'kind',kind,'error',last_error,'at',created_at) order by created_at desc),'[]') from (select * from maoki_private.outbound_queue where workspace_id=w and status='failed' order by created_at desc limit 5) e));
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


grant execute on function maoki_private.channel_inbound(text,jsonb,text,text), public.maoki_channel_inbound(text,jsonb,text,text) to service_role;

create function maoki_private.current_plan() returns text language sql stable security definer set search_path='' as $$
 select b.plan from public.maoki_members m join public.maoki_workspaces b on b.id=m.workspace_id where m.user_id=auth.uid() and m.is_current limit 1;
$$;
create function public.maoki_plan() returns text language sql security invoker set search_path='' as $$ select maoki_private.current_plan() $$;
revoke all on function maoki_private.current_plan(), public.maoki_plan(), maoki_private.extras(text,text,uuid,jsonb), maoki_private.channel_accounts_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function maoki_private.current_plan(), public.maoki_plan(), maoki_private.extras(text,text,uuid,jsonb), maoki_private.channel_accounts_rpc(text,jsonb) to authenticated;

-- ===== supabase/migrations/20261130090000_maoki_remove_ai.sql =====
-- Remove the AI assistant: its settings table and RPC, and the "AI knowledge" resource that only fed it.
drop function if exists public.maoki_ai_settings(text,jsonb);
drop function if exists maoki_private.ai_settings(text,jsonb);
drop table if exists maoki_private.ai_settings;
delete from public.maoki_records where resource='knowledge';
alter table public.maoki_records drop constraint if exists maoki_records_resource_check;
alter table public.maoki_records add constraint maoki_records_resource_check check(resource in (
  'properties','bookings','contacts','conversations','tasks','rates','guidebooks','owners','automations','campaigns','replies','integrations','employees','revenue',
  'tags','rules','hours','reminders','ticketTypes','tickets','bots','journeys','customFields','fieldValues','popups','products','orders','webhooks','agentGroups','calls','reviews','ytComments'));

create or replace function maoki_private.extras(op text,kind text default '',record_id uuid default null,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); w uuid; member_role text; r public.maoki_records; d jsonb; k text; v jsonb; spec jsonb; result jsonb;
 kinds constant text[]:=array['tags','rules','hours','reminders','ticketTypes','tickets','bots','journeys','customFields','fieldValues','popups','products','orders','webhooks','agentGroups','calls','reviews','ytComments'];
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
   return result || jsonb_build_object('plan',(select plan from public.maoki_workspaces where id=w));
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

revoke all on function maoki_private.extras(text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function maoki_private.extras(text,text,uuid,jsonb) to authenticated;

-- ===== supabase/migrations/20261201090000_maoki_stay_messaging.sql =====
-- Stay messaging: booking milestone journeys with payment condition and no-blank-placeholder rule; delete a sender's data.
create or replace function maoki_private.journey_tick() returns jsonb language plpgsql security definer set search_path='' as $$
declare j record; st record; b record; c record; conv record; tz text; ci text; co text; base timestamptz; due timestamptz; mins integer; sign integer; key text; ext text; msg text; queued integer:=0; th maoki_private.channel_threads; email_on boolean; who text; need_paid boolean; txt text; prop record; gb record; paid boolean; miss boolean; dest_p text; dest_e text; ct record;
begin
 for j in select id,workspace_id,data from public.maoki_records where resource='journeys' and data->>'status'='active' loop
   select coalesce(settings->>'timezone','Asia/Ho_Chi_Minh'),coalesce(settings->>'checkinTime','14:00'),coalesce(settings->>'checkoutTime','12:00') into tz,ci,co from public.maoki_workspaces where id=j.workspace_id;
   select exists(select 1 from maoki_private.channel_accounts where workspace_id=j.workspace_id and platform='email' and enabled) into email_on;
   for st in select q.idx,lower(q.m[1]) dir,q.m[2]::integer n,lower(q.m[3]) unit,trim(q.m[4]) body from (select ord::integer idx,regexp_match(line,'^\s*(sau|after|trước|truoc|before)\s+(\d+)\s*(phút|phut|min\w*|giờ|gio|hours?|h|ngày|ngay|days?|d)\s*[:：-]\s*(.+)$','i') m from regexp_split_to_table(j.data->>'steps',E'\n') with ordinality t(line,ord)) q where q.m is not null loop
     mins:=st.n*(case when st.unit ~ '^(phút|phut|min)' then 1 when st.unit ~ '^(giờ|gio|h)' then 60 else 1440 end);
     sign:=case when st.dir in ('trước','truoc','before') then -1 else 1 end;
     if j.data->>'trigger' in ('booking_confirmed','before_checkin','after_checkout') then
       if sign<0 and j.data->>'trigger'<>'before_checkin' then continue; end if;
       for b in select id,data,created_at from public.maoki_records where workspace_id=j.workspace_id and resource='bookings' and data->>'status'='confirmed' loop
         base:=case j.data->>'trigger' when 'booking_confirmed' then b.created_at when 'before_checkin' then ((b.data->>'checkIn')||' '||ci)::timestamp at time zone tz else ((b.data->>'checkOut')||' '||co)::timestamp at time zone tz end;
         due:=base+sign*mins*interval '1 minute';
         if due<=now() and due>now()-interval '2 days' then
           need_paid:=st.body ~* '^\s*\[(đã thanh toán|da thanh toan|paid)\]';
           paid:=coalesce(b.data->>'paymentStatus','unpaid')='paid';
           continue when need_paid and not paid;
           txt:=regexp_replace(st.body,'^\s*\[[^\]]*\]\s*','');
           select id,data into prop from public.maoki_records where workspace_id=j.workspace_id and resource='properties' and id::text=b.data->>'propertyId';
           select data into gb from public.maoki_records where workspace_id=j.workspace_id and resource='guidebooks' and data->>'propertyId'=b.data->>'propertyId' order by created_at limit 1;
           txt:=replace(replace(replace(replace(replace(replace(replace(txt,
             '{{guest}}',coalesce(b.data->>'guestName','')),
             '{{property}}',coalesce(prop.data->>'title',prop.data->>'name','')),
             '{{checkin}}',coalesce(b.data->>'checkIn','')),
             '{{checkout}}',coalesce(b.data->>'checkOut','')),
             '{{wifi}}',coalesce(gb.data->>'wifiName','')),
             '{{wifipass}}',coalesce(gb.data->>'wifiPassword','')),
             '{{guests}}',coalesce(b.data->>'guests',''));
           miss:=length(trim(txt))=0 or txt ~ '\{\{[a-z]+\}\}'
             or (st.body like '%{{guest}}%' and coalesce(b.data->>'guestName','')='')
             or (st.body like '%{{property}}%' and coalesce(prop.data->>'title',prop.data->>'name','')='')
             or (st.body like '%{{wifi}}%' and coalesce(gb.data->>'wifiName','')='')
             or (st.body like '%{{wifipass}}%' and coalesce(gb.data->>'wifiPassword','')='');
           continue when miss;
           dest_e:=lower(coalesce(b.data->>'guestEmail',''));
           th:=null;
           if coalesce(b.data->>'contactId','')<>'' then
             select t.* into th from maoki_private.channel_threads t join public.maoki_records v on v.id=t.conversation_id and v.workspace_id=t.workspace_id where t.workspace_id=j.workspace_id and v.data->>'contactId'=b.data->>'contactId' order by t.conversation_id limit 1;
           end if;
           if dest_e<>'' and email_on then
             insert into maoki_private.journey_runs(journey_id,instance_key,step_idx) values(j.id,b.id::text,st.idx) on conflict do nothing;
             if found then perform maoki_private.enqueue(j.workspace_id,'email',dest_e,null,txt,'journey'); queued:=queued+1; end if;
           elsif th.conversation_id is not null then
             insert into maoki_private.journey_runs(journey_id,instance_key,step_idx) values(j.id,b.id::text,st.idx) on conflict do nothing;
             if found then perform maoki_private.enqueue(j.workspace_id,th.platform,th.external_id,th.conversation_id,txt,'journey'); queued:=queued+1; end if;
           end if;
         end if;
       end loop;
     elsif j.data->>'trigger'='new_contact' and sign>0 then
       for c in select id,data,created_at from public.maoki_records where workspace_id=j.workspace_id and resource='contacts' and created_at>now()-interval '30 days' loop
         due:=c.created_at+mins*interval '1 minute';
         if due<=now() and due>now()-interval '2 days' then
           select t.* into th from maoki_private.channel_threads t join public.maoki_records v on v.id=t.conversation_id and v.workspace_id=t.workspace_id where t.workspace_id=j.workspace_id and v.data->>'contactId'=c.id::text limit 1;
           if th.conversation_id is not null then
             insert into maoki_private.journey_runs(journey_id,instance_key,step_idx) values(j.id,c.id::text,st.idx) on conflict do nothing;
             if found then perform maoki_private.enqueue(j.workspace_id,th.platform,th.external_id,th.conversation_id,replace(st.body,'{{guest}}',coalesce(c.data->>'name','')),'journey'); queued:=queued+1; end if;
           end if;
         end if;
       end loop;
     elsif j.data->>'trigger'='no_reply' and sign>0 then
       for conv in select id,data from public.maoki_records where workspace_id=j.workspace_id and resource='conversations' and data->'messages'->-1->>'sender'='host' and data->>'status'<>'closed' loop
         base:=to_timestamp((conv.data->'messages'->-1->>'timestamp')::numeric/1000); due:=base+mins*interval '1 minute';
         if due<=now() and due>now()-interval '2 days' then
           select t.* into th from maoki_private.channel_threads t where t.workspace_id=j.workspace_id and t.conversation_id=conv.id limit 1;
           if th.conversation_id is not null then
             key:=conv.id::text || ':' || (conv.data->'messages'->-1->>'timestamp');
             insert into maoki_private.journey_runs(journey_id,instance_key,step_idx) values(j.id,key,st.idx) on conflict do nothing;
             if found then perform maoki_private.enqueue(j.workspace_id,th.platform,th.external_id,conv.id,replace(st.body,'{{guest}}',coalesce(conv.data->>'guestName','')),'journey'); queued:=queued+1; end if;
           end if;
         end if;
       end loop;
     end if;
   end loop;
 end loop;
 return jsonb_build_object('queued',queued);
end;
$$;

revoke all on function maoki_private.journey_tick() from public,anon,authenticated;
grant execute on function maoki_private.journey_tick() to service_role;

-- Delete everything stored about one guest/sender: conversations, channel links, queued messages, answers, the contact; bookings are anonymised.
create function maoki_private.delete_sender_data(contact_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); w uuid; member_role text; c public.maoki_records; convs uuid[]; n_conv integer; n_book integer; n_thr integer; n_q integer;
begin
 if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Vui lòng đăng nhập bằng tài khoản Supabase'; end if;
 select workspace_id,m.role into w,member_role from public.maoki_members m where user_id=uid and is_current;
 if w is null then raise exception 'Chưa có không gian làm việc'; end if;
 if member_role not in ('owner','manager') then raise exception 'Chỉ chủ nhà hoặc quản lý được xóa dữ liệu khách'; end if;
 select * into c from public.maoki_records where id=contact_id and workspace_id=w and resource='contacts';
 if not found then raise exception 'Không tìm thấy khách hàng'; end if;
 select coalesce(array_agg(id),'{}') into convs from public.maoki_records where workspace_id=w and resource='conversations' and data->>'contactId'=contact_id::text;
 delete from maoki_private.outbound_queue where workspace_id=w and conversation_id=any(convs);
 get diagnostics n_q=row_count;
 delete from maoki_private.channel_threads where workspace_id=w and conversation_id=any(convs);
 get diagnostics n_thr=row_count;
 delete from public.maoki_records where workspace_id=w and id=any(convs);
 get diagnostics n_conv=row_count;
 delete from public.maoki_records where workspace_id=w and resource='fieldValues' and data->>'contactId'=contact_id::text;
 update public.maoki_records set data=(data-'guestEmail'-'guestPhone'-'notes'-'contactId')||jsonb_build_object('guestName','Đã xóa theo yêu cầu') where workspace_id=w and resource='bookings' and data->>'contactId'=contact_id::text;
 get diagnostics n_book=row_count;
 delete from public.maoki_records where id=contact_id and workspace_id=w;
 perform maoki_private.audit(w,'delete','contacts','Xóa dữ liệu khách theo yêu cầu');
 return jsonb_build_object('conversations',n_conv,'channelLinks',n_thr,'queued',n_q,'bookingsAnonymised',n_book);
end;
$$;
create function public.maoki_delete_sender_data(contact_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select maoki_private.delete_sender_data(contact_id) $$;
revoke all on function maoki_private.delete_sender_data(uuid) from public,anon,authenticated;
grant execute on function maoki_private.delete_sender_data(uuid) to authenticated;
revoke all on function public.maoki_delete_sender_data(uuid) from public,anon;
grant execute on function public.maoki_delete_sender_data(uuid) to authenticated;

-- Bookings gain payment status and guest count.
create or replace function maoki_private.validate(w uuid, kind text, payload jsonb) returns jsonb language plpgsql set search_path='' as $$
declare specs jsonb := '{"properties": {"defaults": {"title": "", "address": "", "description": "", "status": "active", "imageURLs": [], "basePrice": 0, "bedrooms": 1, "capacity": 2, "published": false}, "required": ["title"], "numbers": {"basePrice": [0, 1000000000000.0], "bedrooms": [0, 100], "capacity": [1, 1000]}, "enums": {"status": ["active", "inactive"]}}, "bookings": {"defaults": {"propertyId": "", "guestName": "", "guestEmail": "", "guestPhone": "", "contactId": "", "paymentStatus": "unpaid", "guests": 1, "source": "direct", "checkIn": "", "checkOut": "", "status": "pending", "payoutAmount": 0, "notes": ""}, "required": ["guestName", "propertyId", "checkIn", "checkOut"], "numbers": {"payoutAmount": [0, 1000000000000.0], "guests": [1, 100]}, "enums": {"paymentStatus": ["unpaid", "paid"], "source": ["direct", "airbnb", "booking", "agoda"], "status": ["pending", "confirmed", "cancelled"]}}, "contacts": {"defaults": {"name": "", "email": "", "phone": "", "source": "direct", "stage": "lead", "tags": [], "notes": ""}, "required": ["name"], "enums": {"source": ["direct", "airbnb", "booking", "agoda", "facebook", "instagram", "zalo", "email", "webchat", "whatsapp", "tiktok"], "stage": ["lead", "guest", "returning"]}}, "conversations": {"defaults": {"guestName": "", "platform": "direct", "contactId": "", "assignee": "", "status": "open", "tags": [], "unread": false, "initialMessage": ""}, "required": ["guestName"], "enums": {"platform": ["direct", "airbnb", "booking", "agoda", "facebook", "instagram", "zalo", "email", "webchat", "whatsapp", "tiktok"], "status": ["open", "pending", "closed"]}}, "tasks": {"defaults": {"title": "", "propertyId": "", "assignee": "", "dueDate": "", "status": "todo", "priority": "normal", "type": "cleaning", "notes": ""}, "required": ["title", "dueDate"], "enums": {"status": ["todo", "doing", "done"], "priority": ["normal", "high"], "type": ["cleaning", "maintenance", "checkin"]}}, "rates": {"defaults": {"name": "", "propertyId": "", "startDate": "", "endDate": "", "nightlyRate": 0, "minNights": 1, "closed": false}, "required": ["name", "propertyId", "startDate", "endDate"], "numbers": {"nightlyRate": [0, 1000000000000.0], "minNights": [1, 365]}}, "guidebooks": {"defaults": {"title": "", "propertyId": "", "welcome": "", "checkin": "", "wifiName": "", "wifiPassword": "", "houseRules": "", "recommendations": "", "published": false}, "required": ["title", "propertyId"]}, "owners": {"defaults": {"name": "", "email": "", "phone": "", "propertyIds": [], "commissionRate": 15}, "required": ["name"], "numbers": {"commissionRate": [0, 100]}}, "automations": {"defaults": {"name": "", "trigger": "new_conversation", "action": "create_task", "content": "", "enabled": true}, "required": ["name", "content"], "enums": {"trigger": ["new_conversation", "booking_confirmed", "before_checkin"], "action": ["send_reply", "create_task", "add_tag"]}}, "campaigns": {"defaults": {"name": "", "channel": "email", "audienceTag": "", "subject": "", "content": "", "status": "draft", "scheduledAt": ""}, "required": ["name", "subject", "content"], "enums": {"channel": ["email", "zalo", "facebook"], "status": ["draft", "scheduled"]}}, "replies": {"defaults": {"title": "", "content": ""}, "required": ["title", "content"]}, "integrations": {"defaults": {"platform": "direct", "label": "", "status": "disconnected"}, "required": ["label"], "enums": {"platform": ["direct", "airbnb", "booking", "agoda", "facebook", "instagram", "zalo", "email", "webchat", "whatsapp", "tiktok"], "status": ["disconnected"]}}, "employees": {"defaults": {"name": "", "role": "", "email": "", "phone": "", "status": "active"}, "required": ["name", "role"], "enums": {"status": ["active", "inactive"]}}, "revenue": {"defaults": {"propertyId": "", "type": "expense", "amount": 0, "description": "", "date": ""}, "required": ["description", "date"], "numbers": {"amount": [-1000000000000.0, 1000000000000.0]}, "enums": {"type": ["booking_payout", "expense", "adjustment"]}}}'::jsonb; spec jsonb; result jsonb; k text; v jsonb; required_key text; ref_id text;
begin
 spec:=specs->kind;
 if spec is null or jsonb_typeof(payload) <> 'object' or length(payload::text)>100000 then raise exception 'Dữ liệu không hợp lệ'; end if;
 for k,v in select * from jsonb_each(payload) loop
   if not (spec->'defaults' ? k) then raise exception 'Trường không được phép: %', k; end if;
   if jsonb_typeof(v) <> jsonb_typeof(spec->'defaults'->k) then raise exception 'Kiểu dữ liệu không hợp lệ: %', k; end if;
   if jsonb_typeof(v)='string' and length(v#>>'{}')>10000 then raise exception 'Nội dung quá dài: %',k; end if;
   if jsonb_typeof(v)='array' and jsonb_array_length(v)>100 then raise exception 'Danh sách quá dài: %',k; end if;
 end loop;
 result:=spec->'defaults' || payload;
 for required_key in select jsonb_array_elements_text(spec->'required') loop
   if length(trim(result->>required_key))=0 then raise exception 'Vui lòng nhập: %',required_key; end if;
 end loop;
 for k,v in select * from jsonb_each(coalesce(spec->'numbers','{}')) loop
   if (result->>k)::numeric < (v->>0)::numeric or (result->>k)::numeric > (v->>1)::numeric then raise exception 'Số không hợp lệ: %',k; end if;
 end loop;
 for k,v in select * from jsonb_each(coalesce(spec->'enums','{}')) loop
   if not (v ? (result->>k)) then raise exception 'Giá trị không hợp lệ: %',k; end if;
 end loop;
 foreach k in array array['name','title','guestName','subject','role','description'] loop
   if k <> 'description' and length(result->>k)>150 then raise exception 'Tên quá dài'; end if;
 end loop;
 foreach k in array array['checkIn','checkOut','startDate','endDate','dueDate','date'] loop
   if result ? k then
     if result->>k !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Ngày không hợp lệ'; end if;
     perform (result->>k)::date;
   end if;
 end loop;
 if kind='bookings' and (result->>'checkOut')::date <= (result->>'checkIn')::date then raise exception 'Ngày trả phòng phải sau ngày nhận phòng'; end if;
 if kind='rates' and (result->>'endDate')::date < (result->>'startDate')::date then raise exception 'Khoảng ngày không hợp lệ'; end if;
 foreach k in array array['bedrooms','capacity','minNights'] loop
   if result ? k and mod((result->>k)::numeric,1)<>0 then raise exception 'Vui lòng nhập số nguyên: %',k; end if;
 end loop;
 if kind='automations' and ((result->>'trigger'='new_conversation' and result->>'action'='create_task') or (result->>'trigger'<>'new_conversation' and result->>'action'<>'create_task')) then raise exception 'Hội thoại mới dùng trả lời/gắn nhãn; sự kiện đặt phòng dùng tạo công việc'; end if;
 if kind='campaigns' and coalesce(result->>'scheduledAt','')<>'' then perform (result->>'scheduledAt')::timestamp; end if;
 if kind='campaigns' and result->>'status'='scheduled' and coalesce(result->>'scheduledAt','')='' then raise exception 'Vui lòng chọn lịch dự kiến'; end if;
 if kind='revenue' and result->>'type'<>'adjustment' and (result->>'amount')::numeric < 0 then raise exception 'Nhập số tiền dương cho khoản thu/chi'; end if;
 foreach k in array array['email','guestEmail'] loop
   if coalesce(result->>k,'')<>'' and result->>k !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Email không hợp lệ'; end if;
 end loop;
 foreach k in array array['tags','imageURLs','propertyIds'] loop
   if result ? k then
     for v in select jsonb_array_elements(result->k) loop
       if jsonb_typeof(v)<>'string' or length(v#>>'{}')>2000 then raise exception 'Danh sách không hợp lệ'; end if;
       if k='imageURLs' and v#>>'{}' !~ '^(https://|/)' then raise exception 'Ảnh phải dùng HTTPS'; end if;
       if k='propertyIds' and not exists(select 1 from public.maoki_records where workspace_id=w and resource='properties' and id::text=v#>>'{}') then raise exception 'Không tìm thấy phòng'; end if;
     end loop;
   end if;
 end loop;
 foreach k in array array['propertyId','contactId'] loop
   ref_id:=result->>k;
   if coalesce(ref_id,'')<>'' and not exists(select 1 from public.maoki_records where workspace_id=w and id::text=ref_id and resource=case when k='propertyId' then 'properties' else 'contacts' end) then raise exception 'Không tìm thấy bản ghi liên quan'; end if;
 end loop;
 return result;
end;
$$;
