-- MaokiHouse: tenant-owned workspace data, checked write RPCs and public booking/chat.
-- Apply once using the Supabase SQL editor or the authenticated Supabase CLI.
-- No existing Firebase data is imported and no existing project tables are changed.
begin;
create schema if not exists maoki_private;
revoke all on schema maoki_private from public, anon, authenticated;
grant usage on schema maoki_private to anon, authenticated;
create table public.maoki_workspaces (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
  settings jsonb not null default '{"businessName": "MaokiHouse", "email": "", "phone": "", "address": "", "currency": "VND", "timezone": "Asia/Ho_Chi_Minh", "checkinTime": "14:00", "checkoutTime": "12:00", "widgetEnabled": false, "widgetGreeting": "Chào bạn! MaokiHouse có thể giúp gì cho chuyến đi của bạn?"}'::jsonb,
  created_at timestamptz not null default now()
);
create table public.maoki_members (
  workspace_id uuid not null references public.maoki_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('owner','manager','agent','viewer')),
  is_current boolean not null default true, primary key(workspace_id,user_id)
);
create unique index maoki_current_membership on public.maoki_members(user_id) where is_current;
create index maoki_members_user on public.maoki_members(user_id,workspace_id);
create table public.maoki_records (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.maoki_workspaces(id) on delete cascade,
  resource text not null check(resource in ('properties','bookings','contacts','conversations','tasks','rates','guidebooks','owners','automations','campaigns','replies','integrations','employees','revenue')),
  data jsonb not null check(jsonb_typeof(data)='object'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index maoki_records_workspace on public.maoki_records(workspace_id,resource);
create index maoki_records_property on public.maoki_records(workspace_id,resource,(data->>'propertyId'));
create index maoki_public_guide_token on public.maoki_records((data->>'publicToken')) where resource='guidebooks';
create index maoki_widget_token on public.maoki_workspaces((settings->>'widgetToken'));
create table public.maoki_activity (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.maoki_workspaces(id) on delete cascade,
  data jsonb not null, created_at timestamptz not null default now()
);
create index maoki_activity_workspace on public.maoki_activity(workspace_id,created_at desc);
create table maoki_private.visitors (
  token_hash text primary key, workspace_id uuid not null references public.maoki_workspaces(id) on delete cascade,
  conversation_id uuid not null references public.maoki_records(id) on delete cascade, expires_at timestamptz not null
);
create index maoki_visitors_workspace on maoki_private.visitors(workspace_id);
create table maoki_private.invites (
  token text primary key, workspace_id uuid not null references public.maoki_workspaces(id) on delete cascade,
  email text not null, role text not null check(role in ('manager','agent','viewer')),
  expires_at timestamptz not null default now()+interval '7 days'
);
create index maoki_invites_workspace on maoki_private.invites(workspace_id);
create table maoki_private.budgets (
  workspace_id uuid not null references public.maoki_workspaces(id) on delete cascade,
  bucket text not null, minute timestamptz not null, count integer not null, primary key(workspace_id,bucket,minute)
);
alter table public.maoki_workspaces enable row level security;
alter table public.maoki_members enable row level security;
alter table public.maoki_records enable row level security;
alter table public.maoki_activity enable row level security;
alter table maoki_private.visitors enable row level security;
alter table maoki_private.invites enable row level security;
alter table maoki_private.budgets enable row level security;
revoke all on public.maoki_workspaces, public.maoki_members, public.maoki_records, public.maoki_activity from public,anon,authenticated;
revoke all on all tables in schema maoki_private from public,anon,authenticated;
grant select on public.maoki_workspaces,public.maoki_members,public.maoki_records,public.maoki_activity to authenticated;

-- Definer helpers are private, pinned to an empty search_path, and check membership explicitly.
-- Browser roles have no direct write grants; every write passes validation below.
create function maoki_private.is_member(w uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.maoki_members where workspace_id=w and user_id=(select auth.uid()));
$$;
create policy maoki_workspace_read on public.maoki_workspaces for select to authenticated using(maoki_private.is_member(id));
create policy maoki_member_read on public.maoki_members for select to authenticated using(maoki_private.is_member(workspace_id));
create policy maoki_record_read on public.maoki_records for select to authenticated using(maoki_private.is_member(workspace_id));
create policy maoki_activity_read on public.maoki_activity for select to authenticated using(maoki_private.is_member(workspace_id));

create function maoki_private.pack(r public.maoki_records) returns jsonb language sql stable set search_path='' as $$
 select r.data || jsonb_build_object('id',r.id,'hostId',r.workspace_id,'createdAt',extract(epoch from r.created_at)*1000,'updatedAt',extract(epoch from r.updated_at)*1000);
$$;
create function maoki_private.audit(w uuid, action text, resource text, label text) returns void language sql set search_path='' as $$
 insert into public.maoki_activity(workspace_id,data) values(w,jsonb_build_object('action',action,'resource',resource,'label',left(label,150),'actor',coalesce(auth.jwt()->>'email','Khách website'),'timestamp',extract(epoch from clock_timestamp())*1000));
$$;
create function maoki_private.validate(w uuid, kind text, payload jsonb) returns jsonb language plpgsql set search_path='' as $$
declare specs jsonb := '{"properties": {"defaults": {"title": "", "address": "", "description": "", "status": "active", "imageURLs": [], "basePrice": 0, "bedrooms": 1, "capacity": 2, "published": false}, "required": ["title"], "numbers": {"basePrice": [0, 1000000000000.0], "bedrooms": [0, 100], "capacity": [1, 1000]}, "enums": {"status": ["active", "inactive"]}}, "bookings": {"defaults": {"propertyId": "", "guestName": "", "guestEmail": "", "guestPhone": "", "contactId": "", "source": "direct", "checkIn": "", "checkOut": "", "status": "pending", "payoutAmount": 0, "notes": ""}, "required": ["guestName", "propertyId", "checkIn", "checkOut"], "numbers": {"payoutAmount": [0, 1000000000000.0]}, "enums": {"source": ["direct", "airbnb", "booking", "agoda"], "status": ["pending", "confirmed", "cancelled"]}}, "contacts": {"defaults": {"name": "", "email": "", "phone": "", "source": "direct", "stage": "lead", "tags": [], "notes": ""}, "required": ["name"], "enums": {"source": ["direct", "airbnb", "booking", "agoda", "facebook", "instagram", "zalo", "email", "webchat"], "stage": ["lead", "guest", "returning"]}}, "conversations": {"defaults": {"guestName": "", "platform": "direct", "contactId": "", "assignee": "", "status": "open", "tags": [], "unread": false, "initialMessage": ""}, "required": ["guestName"], "enums": {"platform": ["direct", "airbnb", "booking", "agoda", "facebook", "instagram", "zalo", "email", "webchat"], "status": ["open", "pending", "closed"]}}, "tasks": {"defaults": {"title": "", "propertyId": "", "assignee": "", "dueDate": "", "status": "todo", "priority": "normal", "type": "cleaning", "notes": ""}, "required": ["title", "dueDate"], "enums": {"status": ["todo", "doing", "done"], "priority": ["normal", "high"], "type": ["cleaning", "maintenance", "checkin"]}}, "rates": {"defaults": {"name": "", "propertyId": "", "startDate": "", "endDate": "", "nightlyRate": 0, "minNights": 1, "closed": false}, "required": ["name", "propertyId", "startDate", "endDate"], "numbers": {"nightlyRate": [0, 1000000000000.0], "minNights": [1, 365]}}, "guidebooks": {"defaults": {"title": "", "propertyId": "", "welcome": "", "checkin": "", "wifiName": "", "wifiPassword": "", "houseRules": "", "recommendations": "", "published": false}, "required": ["title", "propertyId"]}, "owners": {"defaults": {"name": "", "email": "", "phone": "", "propertyIds": [], "commissionRate": 15}, "required": ["name"], "numbers": {"commissionRate": [0, 100]}}, "automations": {"defaults": {"name": "", "trigger": "new_conversation", "action": "create_task", "content": "", "enabled": true}, "required": ["name", "content"], "enums": {"trigger": ["new_conversation", "booking_confirmed", "before_checkin"], "action": ["send_reply", "create_task", "add_tag"]}}, "campaigns": {"defaults": {"name": "", "channel": "email", "audienceTag": "", "subject": "", "content": "", "status": "draft", "scheduledAt": ""}, "required": ["name", "subject", "content"], "enums": {"channel": ["email", "zalo", "facebook"], "status": ["draft", "scheduled"]}}, "replies": {"defaults": {"title": "", "content": ""}, "required": ["title", "content"]}, "integrations": {"defaults": {"platform": "direct", "label": "", "status": "disconnected"}, "required": ["label"], "enums": {"platform": ["direct", "airbnb", "booking", "agoda", "facebook", "instagram", "zalo", "email", "webchat"], "status": ["disconnected"]}}, "employees": {"defaults": {"name": "", "role": "", "email": "", "phone": "", "status": "active"}, "required": ["name", "role"], "enums": {"status": ["active", "inactive"]}}, "revenue": {"defaults": {"propertyId": "", "type": "expense", "amount": 0, "description": "", "date": ""}, "required": ["description", "date"], "numbers": {"amount": [-1000000000000.0, 1000000000000.0]}, "enums": {"type": ["booking_payout", "expense", "adjustment"]}}}'::jsonb; spec jsonb; result jsonb; k text; v jsonb; required_key text; ref_id text;
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
create function maoki_private.no_conflict(w uuid, record_id uuid, d jsonb) returns void language plpgsql set search_path='' as $$
begin
 if d->>'status'='cancelled' then return; end if;
 if not exists(select 1 from public.maoki_records where workspace_id=w and resource='properties' and id::text=d->>'propertyId' and data->>'status'='active') then raise exception 'Phòng chưa hoạt động'; end if;
 if exists(select 1 from public.maoki_records where workspace_id=w and resource='bookings' and id<>record_id and data->>'propertyId'=d->>'propertyId' and data->>'status'<>'cancelled' and data->>'checkIn'<d->>'checkOut' and data->>'checkOut'>d->>'checkIn') then raise exception 'Phòng đã có đặt chỗ trong khoảng ngày này'; end if;
end;
$$;
create function maoki_private.run_rule(w uuid, rule_id uuid, context_id uuid) returns void language plpgsql set search_path='' as $$
declare rule jsonb; target public.maoki_records; d jsonb;
begin
 select data into rule from public.maoki_records where workspace_id=w and resource='automations' and id=rule_id;
 if rule is null or not (rule->>'enabled')::boolean then raise exception 'Quy tắc chưa hoạt động'; end if;
 select * into target from public.maoki_records where workspace_id=w and id=context_id and resource in ('bookings','conversations');
 if target.id is null then raise exception 'Chọn đặt phòng hoặc cuộc trò chuyện'; end if;
 if rule->>'action'='create_task' then
   d:=maoki_private.validate(w,'tasks',jsonb_build_object('title',left(replace(rule->>'content','{{guest}}',coalesce(target.data->>'guestName','khách')),150),'dueDate',coalesce(target.data->>'checkIn',to_char(now() at time zone 'Asia/Ho_Chi_Minh','YYYY-MM-DD')),'propertyId',coalesce(target.data->>'propertyId','')));
   insert into public.maoki_records(workspace_id,resource,data) values(w,'tasks',d);
 elsif rule->>'action'='add_tag' then
   if target.resource <> 'conversations' then raise exception 'Gắn thẻ cần một cuộc trò chuyện'; end if;
   update public.maoki_records set data=jsonb_set(data,'{tags}',coalesce(data->'tags','[]') || to_jsonb(left(rule->>'content',50))),updated_at=now() where id=target.id;
 else
   if target.resource <> 'conversations' then raise exception 'Trả lời cần một cuộc trò chuyện'; end if;
   update public.maoki_records set data=data || jsonb_build_object('messages',(select coalesce(jsonb_agg(value),'[]') from (select value from jsonb_array_elements(coalesce(data->'messages','[]')) with ordinality where ordinality>jsonb_array_length(coalesce(data->'messages','[]'))-199) q) || jsonb_build_array(jsonb_build_object('sender','host','text',left(replace(rule->>'content','{{guest}}',coalesce(target.data->>'guestName','khách')),3000),'timestamp',extract(epoch from clock_timestamp())*1000,'delivery','local')),'lastMessageAt',extract(epoch from clock_timestamp())*1000),updated_at=now() where id=target.id;
 end if;
 update public.maoki_records set data=data || jsonb_build_object('runCount',coalesce((data->>'runCount')::int,0)+1,'lastRunAt',extract(epoch from clock_timestamp())*1000),updated_at=now() where id=rule_id;
 perform maoki_private.audit(w,'automation','automations',rule->>'name');
end;
$$;
create function maoki_private.trigger_rules(w uuid,event text,context_id uuid) returns void language plpgsql set search_path='' as $$
declare r record;
begin
 for r in select id from public.maoki_records where workspace_id=w and resource='automations' and data->>'trigger'=event and data->>'enabled'='true' loop
   -- Only run actions compatible with the trigger's context; no external delivery is attempted.
   if event='new_conversation' or exists(select 1 from public.maoki_records where id=r.id and data->>'action'='create_task') then
     perform maoki_private.run_rule(w,r.id,context_id);
   end if;
 end loop;
end;
$$;

create function maoki_private.workspace(op text,kind text,record_id uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); w uuid; member_role text; r public.maoki_records; d jsonb; spec jsonb; k text; v jsonb; result jsonb; token text; email text; target_uid uuid;
begin
 if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Vui lòng đăng nhập bằng tài khoản Supabase'; end if;
 -- Serialize membership changes and workspace creation for this user.
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 if op='accept_invite' then
   -- use explicit record lookup below to avoid trusting caller-supplied email or workspace.
   select i.workspace_id,i.role,i.email into w,member_role,email from maoki_private.invites i where i.token=payload->>'token' and expires_at>now();
   if w is null or lower(email)<>lower(auth.jwt()->>'email') or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null) then raise exception 'Lời mời không hợp lệ hoặc email chưa xác minh'; end if;
   update public.maoki_members set is_current=false where user_id=uid;
   insert into public.maoki_members(workspace_id,user_id,role,is_current) values(w,uid,member_role,true) on conflict(workspace_id,user_id) do update set is_current=true;
   delete from maoki_private.invites where invites.token=payload->>'token';
   return jsonb_build_object('ok',true);
 end if;
 if op='workspaces' then
   return (select coalesce(jsonb_agg(jsonb_build_object('id',m.workspace_id,'name',b.settings->>'businessName','role',m.role,'current',m.is_current)),'[]') from public.maoki_members m join public.maoki_workspaces b on b.id=m.workspace_id where m.user_id=uid);
 elsif op='switch' then
   if not exists(select 1 from public.maoki_members where user_id=uid and workspace_id=(payload->>'id')::uuid) then raise exception 'Bạn không có quyền truy cập không gian'; end if;
   update public.maoki_members set is_current=false where user_id=uid;
   update public.maoki_members set is_current=true where user_id=uid and workspace_id=(payload->>'id')::uuid;
   return '{"ok":true}';
 end if;
 select workspace_id,role into w,member_role from public.maoki_members where user_id=uid and is_current;
 if w is null then
   if op <> 'snapshot' then raise exception 'Hãy mở không gian trước'; end if;
   insert into public.maoki_workspaces(owner_id) values(uid) returning id into w;
   update public.maoki_workspaces set settings=settings || jsonb_build_object('widgetToken',replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')) where id=w;
   insert into public.maoki_members(workspace_id,user_id,role) values(w,uid,'owner'); member_role:='owner';
 end if;
 if op='snapshot' then
   result:=jsonb_build_object('workspaceId',w,'settings',(select settings from public.maoki_workspaces where id=w),'capabilities',jsonb_build_object('localDemo',false,'aiConfigured',false,'role',member_role));
   foreach k in array array['properties','bookings','contacts','conversations','tasks','rates','guidebooks','owners','automations','campaigns','replies','integrations','employees','revenue'] loop
     result:=result || jsonb_build_object(k,(select coalesce(jsonb_agg(maoki_private.pack(x) order by x.created_at desc),'[]') from public.maoki_records x where workspace_id=w and resource=k));
   end loop;
   return result || jsonb_build_object('activity',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id,'hostId',workspace_id)),'[]') from (select * from public.maoki_activity where workspace_id=w order by created_at desc limit 50) q));
 end if;
 if op='team' then
   return jsonb_build_object('members',(select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'role',m.role,'email',u.email)),'[]') from public.maoki_members m join auth.users u on u.id=m.user_id where m.workspace_id=w),'invites',case when member_role='owner' then (select coalesce(jsonb_agg(to_jsonb(i)-'workspace_id'),'[]') from maoki_private.invites i where i.workspace_id=w and expires_at>now()) else '[]'::jsonb end);
 end if;
 perform pg_advisory_xact_lock(hashtextextended(w::text,1));
 if op in ('invite','revoke_member','revoke_invite') then
   if member_role<>'owner' then raise exception 'Chỉ chủ không gian được quản lý quyền truy cập'; end if;
   if op='invite' then
     email:=lower(trim(payload->>'email')); member_role:=payload->>'role';
     if email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or member_role not in ('manager','agent','viewer') then raise exception 'Email hoặc vai trò không hợp lệ'; end if;
     token:=replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
     insert into maoki_private.invites(token,workspace_id,email,role) values(token,w,email,member_role);
     return jsonb_build_object('token',token);
   elsif op='revoke_member' then
     target_uid:=(payload->>'id')::uuid;
     if target_uid=(select owner_id from public.maoki_workspaces where id=w) then raise exception 'Không thể xóa chủ không gian'; end if;
     delete from public.maoki_members where workspace_id=w and user_id=target_uid;
   else delete from maoki_private.invites where workspace_id=w and invites.token=payload->>'token';
   end if;
   return jsonb_build_object('ok',true);
 end if;
 if member_role='viewer' or (member_role='agent' and (kind not in ('bookings','contacts','conversations','tasks') or op not in ('save','delete','message'))) then raise exception 'Bạn không có quyền thực hiện thao tác này'; end if;
 if op='settings' then
   spec:='{"businessName": "MaokiHouse", "email": "", "phone": "", "address": "", "currency": "VND", "timezone": "Asia/Ho_Chi_Minh", "checkinTime": "14:00", "checkoutTime": "12:00", "widgetEnabled": false, "widgetGreeting": "Chào bạn! MaokiHouse có thể giúp gì cho chuyến đi của bạn?"}'::jsonb;
   if jsonb_typeof(payload)<>'object' then raise exception 'Cài đặt không hợp lệ'; end if;
   for k,v in select * from jsonb_each(payload) loop
     if not(spec ? k) or jsonb_typeof(v)<>jsonb_typeof(spec->k) or length(v::text)>2000 then raise exception 'Cài đặt không hợp lệ: %',k; end if;
   end loop;
   d:=spec || payload;
   if trim(d->>'businessName')='' or d->>'currency' not in ('VND','USD') or not exists(select 1 from pg_timezone_names where name=d->>'timezone') or d->>'checkinTime' !~ '^([01]\d|2[0-3]):[0-5]\d$' or d->>'checkoutTime' !~ '^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'Cài đặt không hợp lệ'; end if;
   update public.maoki_workspaces set settings=d || jsonb_build_object('widgetToken',settings->>'widgetToken') where id=w returning settings into result;
   perform maoki_private.audit(w,'settings','settings',d->>'businessName'); return result;
 end if;
 if op='run' then
   perform maoki_private.run_rule(w,record_id,(payload->>'contextId')::uuid); return '{"ok":true}';
 end if;
 if record_id is not null then
   select * into r from public.maoki_records where id=record_id and workspace_id=w and resource=kind;
   if r.id is null then raise exception 'Không tìm thấy bản ghi'; end if;
 end if;
 if op='delete' then
   if r.id is null then raise exception 'Không tìm thấy bản ghi'; end if;
   if kind in ('properties','contacts') and exists(select 1 from public.maoki_records x where workspace_id=w and id<>r.id and (x.data->>case when kind='properties' then 'propertyId' else 'contactId' end=r.id::text or (kind='properties' and x.data->'propertyIds' ? r.id::text))) then raise exception 'Bản ghi đang được sử dụng. Hãy cập nhật các bản ghi liên quan trước'; end if;
   delete from public.maoki_records where id=r.id;
   perform maoki_private.audit(w,'delete',kind,coalesce(r.data->>'title',r.data->>'name',r.data->>'guestName',kind)); return '{"ok":true}';
 elsif op='message' then
   if r.resource<>'conversations' or r.id is null or length(trim(payload->>'text')) not between 1 and 3000 or payload->>'sender'='guest' then raise exception 'Tin nhắn không hợp lệ'; end if;
   d:=r.data || jsonb_build_object('messages',(select coalesce(jsonb_agg(value),'[]') from (select value from jsonb_array_elements(r.data->'messages') with ordinality where ordinality>jsonb_array_length(r.data->'messages')-199) q) || jsonb_build_array(jsonb_build_object('sender','host','text',trim(payload->>'text'),'timestamp',extract(epoch from clock_timestamp())*1000,'delivery','local')),'lastMessageAt',extract(epoch from clock_timestamp())*1000,'unread',false);
 elsif op='save' then
   d:=maoki_private.validate(w,kind,(coalesce(r.data,'{}') - array['messages','publicToken','runCount','lastRunAt','lastMessageAt']) || payload);
   if r.id is null then r.id:=gen_random_uuid(); end if;
   if kind='bookings' then perform maoki_private.no_conflict(w,r.id,d); end if;
   if kind='conversations' then
     d:=(d-'initialMessage') || jsonb_build_object('messages',coalesce(r.data->'messages',case when coalesce(d->>'initialMessage','')='' then '[]'::jsonb else jsonb_build_array(jsonb_build_object('sender','guest','text',left(d->>'initialMessage',3000),'timestamp',extract(epoch from clock_timestamp())*1000)) end),'lastMessageAt',coalesce(r.data->'lastMessageAt',to_jsonb(extract(epoch from clock_timestamp())*1000)));
   elsif kind='guidebooks' then d:=d || jsonb_build_object('publicToken',coalesce(r.data->>'publicToken',replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')));
   elsif kind='automations' then d:=d || jsonb_build_object('runCount',coalesce(r.data->'runCount','0'));
   end if;
 else raise exception 'Thao tác không được hỗ trợ';
 end if;
 insert into public.maoki_records(id,workspace_id,resource,data) values(r.id,w,kind,d) on conflict(id) do update set data=excluded.data,updated_at=clock_timestamp();
 perform maoki_private.audit(w,op,kind,coalesce(d->>'title',d->>'name',d->>'guestName',kind));
 if op='save' and kind='conversations' and r.created_at is null then perform maoki_private.trigger_rules(w,'new_conversation',r.id); end if;
 if op='save' and kind='bookings' and d->>'status'='confirmed' and coalesce(r.data->>'status','')<>'confirmed' then perform maoki_private.trigger_rules(w,'booking_confirmed',r.id); end if;
 return (select maoki_private.pack(x) from public.maoki_records x where id=r.id);
end;
$$;
create function maoki_private.budget(w uuid,b text,max_count integer) returns void language plpgsql set search_path='' as $$
declare n integer;
begin
 delete from maoki_private.budgets where workspace_id=w and minute<now()-interval '2 minutes';
 insert into maoki_private.budgets(workspace_id,bucket,minute,count) values(w,b,date_trunc('minute',now()),1)
 on conflict(workspace_id,bucket,minute) do update set count=budgets.count+1 returning count into n;
 if n>max_count then raise exception 'Có quá nhiều yêu cầu. Vui lòng thử lại sau'; end if;
end;
$$;
create function maoki_private.quote(w uuid,p uuid,ci text,co text) returns jsonb language plpgsql set search_path='' as $$
declare stay jsonb; rate jsonb; day date; total numeric:=0; night_count integer;
begin
 if ci !~ '^\d{4}-\d{2}-\d{2}$' or co !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Ngày không hợp lệ'; end if;
 night_count:=co::date-ci::date;
 if ci::date<(now() at time zone 'Asia/Ho_Chi_Minh')::date or night_count not between 1 and 90 then raise exception 'Chọn kỳ nghỉ từ 1 đến 90 đêm, từ hôm nay'; end if;
 select data into stay from public.maoki_records where workspace_id=w and id=p and resource='properties' and data->>'published'='true' and data->>'status'='active';
 if stay is null then raise exception 'Không tìm thấy phòng đang mở đặt chỗ'; end if;
 if exists(select 1 from public.maoki_records where workspace_id=w and resource='bookings' and data->>'propertyId'=p::text and data->>'status'<>'cancelled' and data->>'checkIn'<co and data->>'checkOut'>ci) then raise exception 'Phòng đã có đặt chỗ trong khoảng ngày này'; end if;
 for day in select generate_series(ci::date,co::date-1,'1 day')::date loop
   select data into rate from public.maoki_records where workspace_id=w and resource='rates' and data->>'propertyId'=p::text and data->>'startDate'<=day::text and data->>'endDate'>=day::text order by updated_at desc,id desc limit 1;
   if coalesce((rate->>'closed')::boolean,false) then raise exception 'Phòng tạm đóng trong ngày đã chọn'; end if;
   if night_count<coalesce((rate->>'minNights')::integer,1) then raise exception 'Kỳ nghỉ chưa đạt số đêm tối thiểu'; end if;
   total:=total+coalesce((rate->>'nightlyRate')::numeric,(stay->>'basePrice')::numeric);
 end loop;
 return jsonb_build_object('nights',night_count,'total',total,'currency',(select settings->>'currency' from public.maoki_workspaces where id=w));
end;
$$;
create function maoki_private.public_request(op text,record_id uuid,token text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare w uuid; r public.maoki_records; settings jsonb; d jsonb; q jsonb; cid uuid; bid uuid; session_key text; messages jsonb; visitor maoki_private.visitors; k text; result jsonb;
begin
 if jsonb_typeof(payload)<>'object' or length(payload::text)>20000 then raise exception 'Yêu cầu không hợp lệ'; end if;
 if op='list' then
   return (select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'title',x.data->>'title','address',x.data->>'address','description',x.data->>'description','imageURLs',x.data->'imageURLs','basePrice',x.data->'basePrice','capacity',x.data->'capacity','currency',b.settings->>'currency','businessName',b.settings->>'businessName')),'[]') from (select * from public.maoki_records where resource='properties' and data->>'published'='true' and data->>'status'='active' order by created_at desc limit 50) x join public.maoki_workspaces b on b.id=x.workspace_id);
 end if;
 if op in ('property','quote','book') then
   select * into r from public.maoki_records where id=record_id and resource='properties' and data->>'published'='true' and data->>'status'='active'; w:=r.workspace_id;
 elsif op='guide' then
   select * into r from public.maoki_records where resource='guidebooks' and data->>'publicToken'=token and data->>'published'='true'; w:=r.workspace_id;
 elsif op in ('widget','chat') then
   select id into w from public.maoki_workspaces x where x.settings->>'widgetToken'=token and x.settings->>'widgetEnabled'='true';
 else raise exception 'Thao tác không được hỗ trợ';
 end if;
 if w is null then raise exception 'Liên kết chưa được mở hoặc không tồn tại'; end if;
 select x.settings into settings from public.maoki_workspaces x where id=w;
 if op='property' then
   result:=jsonb_build_object('id',r.id,'businessName',settings->>'businessName','currency',settings->>'currency','checkinTime',settings->>'checkinTime','checkoutTime',settings->>'checkoutTime');
   foreach k in array array['title','description','address','imageURLs','basePrice','bedrooms','capacity'] loop result:=result || jsonb_build_object(k,r.data->k); end loop;
   return result;
 elsif op='guide' then
   return (r.data-array['propertyId','publicToken','published']) || jsonb_build_object('propertyTitle',(select data->>'title' from public.maoki_records where id::text=r.data->>'propertyId' and workspace_id=w and resource='properties'));
 elsif op='quote' then return maoki_private.quote(w,r.id,payload->>'checkIn',payload->>'checkOut');
 elsif op='book' then
   perform pg_advisory_xact_lock(hashtextextended(w::text,1));
   perform maoki_private.budget(w,'booking',20);
   q:=maoki_private.quote(w,r.id,payload->>'checkIn',payload->>'checkOut');
   if length(trim(coalesce(payload->>'phone',''))) not between 5 and 50 or length(trim(coalesce(payload->>'email','')))=0 then raise exception 'Vui lòng nhập email và điện thoại liên hệ'; end if;
   d:=maoki_private.validate(w,'contacts',jsonb_build_object('name',payload->>'name','email',payload->>'email','phone',payload->>'phone','source','direct','stage','guest'));
   insert into public.maoki_records(workspace_id,resource,data) values(w,'contacts',d) returning id into cid;
   d:=maoki_private.validate(w,'bookings',jsonb_build_object('propertyId',r.id,'guestName',payload->>'name','guestEmail',payload->>'email','guestPhone',payload->>'phone','contactId',cid,'source','direct','checkIn',payload->>'checkIn','checkOut',payload->>'checkOut','status','pending','payoutAmount',q->'total','notes',coalesce(payload->>'notes','')));
   bid:=gen_random_uuid(); perform maoki_private.no_conflict(w,bid,d);
   insert into public.maoki_records(id,workspace_id,resource,data) values(bid,w,'bookings',d);
   perform maoki_private.audit(w,'public_booking','bookings',d->>'guestName'); return jsonb_build_object('reference',bid);
 end if;
 -- Visitor sessions are random bearer secrets, stored only as hashes and never listed publicly.
 session_key:=coalesce(payload->>'session','');
 if session_key<>'' then
   if session_key !~ '^[a-f0-9]{64}$' then raise exception 'Phiên trò chuyện không hợp lệ'; end if;
   select * into visitor from maoki_private.visitors where token_hash=encode(sha256(convert_to(session_key,'UTF8')),'hex') and workspace_id=w and expires_at>now();
   if visitor.conversation_id is null then raise exception 'Phiên trò chuyện đã hết hạn'; end if;
   select * into r from public.maoki_records where id=visitor.conversation_id and workspace_id=w and resource='conversations';
   if r.id is null then raise exception 'Không tìm thấy cuộc trò chuyện'; end if;
 end if;
 if op='widget' then return jsonb_build_object('businessName',settings->>'businessName','greeting',settings->>'widgetGreeting','messages',coalesce(r.data->'messages','[]')); end if;
 if length(trim(coalesce(payload->>'text',''))) not between 1 and 2000 then raise exception 'Nhập tin nhắn từ 1 đến 2000 ký tự'; end if;
 perform pg_advisory_xact_lock(hashtextextended(w::text,1));
 perform maoki_private.budget(w,'chat',60);
 if visitor.conversation_id is null then
   if length(trim(coalesce(payload->>'name',''))) not between 1 and 100 then raise exception 'Vui lòng nhập tên'; end if;
   perform maoki_private.budget(w,'visitor',10);
   insert into public.maoki_records(workspace_id,resource,data) values(w,'contacts',maoki_private.validate(w,'contacts',jsonb_build_object('name',payload->>'name','source','webchat'))) returning id into cid;
   r.id:=gen_random_uuid();
   r.data:=maoki_private.validate(w,'conversations',jsonb_build_object('guestName',payload->>'name','platform','webchat','contactId',cid,'unread',true))-'initialMessage';
   r.data:=r.data || jsonb_build_object('messages','[]'::jsonb,'lastMessageAt',extract(epoch from clock_timestamp())*1000);
   insert into public.maoki_records(id,workspace_id,resource,data) values(r.id,w,'conversations',r.data);
   session_key:=replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
   insert into maoki_private.visitors values(encode(sha256(convert_to(session_key,'UTF8')),'hex'),w,r.id,now()+interval '7 days');
 else
   -- Re-read after the lock to avoid losing a simultaneous host or visitor message.
   select * into r from public.maoki_records where id=visitor.conversation_id and workspace_id=w;
 end if;
 messages:=(select coalesce(jsonb_agg(value),'[]') from (select value from jsonb_array_elements(r.data->'messages') with ordinality where ordinality>jsonb_array_length(r.data->'messages')-199) q) || jsonb_build_array(jsonb_build_object('sender','guest','text',trim(payload->>'text'),'timestamp',extract(epoch from clock_timestamp())*1000));
 update public.maoki_records set data=data || jsonb_build_object('messages',messages,'unread',true,'status','open','lastMessageAt',extract(epoch from clock_timestamp())*1000),updated_at=clock_timestamp() where id=r.id;
 if visitor.conversation_id is null then perform maoki_private.trigger_rules(w,'new_conversation',r.id); end if;
 perform maoki_private.audit(w,'guest_message','conversations',r.data->>'guestName');
 return jsonb_build_object('session',session_key,'messages',(select data->'messages' from public.maoki_records where id=r.id));
end;
$$;

-- Only these two invoker wrappers are exposed through the Data API.
create function public.maoki_workspace(op text,kind text default '',record_id uuid default null,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$
 select maoki_private.workspace(op,kind,record_id,payload);
$$;
create function public.maoki_public(op text,record_id uuid default null,token text default '',payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$
 select maoki_private.public_request(op,record_id,token,payload);
$$;
revoke all on all functions in schema maoki_private from public,anon,authenticated;
grant execute on function maoki_private.is_member(uuid) to authenticated;
grant execute on function maoki_private.workspace(text,text,uuid,jsonb) to authenticated;
grant execute on function maoki_private.public_request(text,uuid,text,jsonb) to anon,authenticated;
revoke all on function public.maoki_workspace(text,text,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.maoki_public(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.maoki_workspace(text,text,uuid,jsonb) to authenticated;
grant execute on function public.maoki_public(text,uuid,text,jsonb) to anon,authenticated;

-- Realtime is optional; polling remains available if the project has no publication.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
   alter publication supabase_realtime add table public.maoki_records;
 end if;
end $$;
notify pgrst, 'reload schema';
commit;
