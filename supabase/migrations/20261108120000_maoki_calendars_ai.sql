-- More calendar sources (any channel that exports iCal) and per-workspace AI
-- settings. The OpenRouter key is stored in a private table: it is never part
-- of a snapshot or status response, only of the role-gated 'secret' operation
-- that the server-side /api/assistant function calls. Callers holding that role can
-- also call 'secret' directly; the UI states this, and OPENROUTER_API_KEY on the
-- server keeps a key out of the database entirely.
begin;

-- 1. Calendar sources ---------------------------------------------------------
alter table maoki_private.channel_calendars drop constraint channel_calendars_platform_check;
alter table maoki_private.channel_calendars add constraint channel_calendars_platform_check
 check(platform in ('airbnb','booking','agoda','vrbo','expedia','traveloka','tripcom','google','ical'));
alter table maoki_private.channel_calendars add column label text not null default '' check(length(label)<=80);
alter table maoki_private.channel_calendars drop constraint channel_calendars_workspace_id_property_id_platform_key;
-- One feed per named channel and room; generic iCal may hold several feeds per room.
create unique index maoki_channel_calendar_unique on maoki_private.channel_calendars(workspace_id,property_id,platform) where platform<>'ical';
create unique index maoki_channel_calendar_url on maoki_private.channel_calendars(workspace_id,property_id,ical_url);

create or replace function maoki_private.channels(op text, connection_id uuid, payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); w uuid; member_role text; c maoki_private.channel_calendars; item jsonb; n integer; conflicts integer; platform_name text; p uuid; url text; label_text text;
begin
 if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Vui lòng đăng nhập'; end if;
 if jsonb_typeof(payload)<>'object' or octet_length(payload::text)>1000000 then raise exception 'Yêu cầu không hợp lệ'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 select workspace_id,role into w,member_role from public.maoki_members where user_id=uid and is_current;
 if w is null then raise exception 'Hãy mở không gian quản lý trước'; end if;
 if op='busy' then
  return (select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'propertyId',b.property_id,'checkIn',b.check_in,'checkOut',b.check_out,'platform',cc.platform)),'[]') from maoki_private.calendar_blocks b join maoki_private.channel_calendars cc on cc.id=b.connection_id where b.workspace_id=w);
 end if;
 if member_role not in ('owner','manager') then raise exception 'Chỉ chủ không gian và quản lý được kết nối kênh'; end if;
 perform pg_advisory_xact_lock(hashtextextended(w::text,0));
 if op='list' then
  return (select coalesce(jsonb_agg(jsonb_build_object('id',cc.id,'propertyId',cc.property_id,'platform',cc.platform,'label',cc.label,'exportToken',cc.export_token,'lastSyncedAt',cc.last_synced_at,'lastError',cc.last_error,'blockCount',(select count(*) from maoki_private.calendar_blocks where calendar_blocks.connection_id=cc.id)) order by cc.created_at),'[]') from maoki_private.channel_calendars cc where cc.workspace_id=w);
 end if;
 if op='save' then
  platform_name:=payload->>'platform'; p:=(payload->>'propertyId')::uuid; url:=trim(payload->>'url'); label_text:=left(trim(coalesce(payload->>'label','')),80);
  if platform_name is null or platform_name not in ('airbnb','booking','agoda','vrbo','expedia','traveloka','tripcom','google','ical') or length(url) not between 10 and 4096 then raise exception 'Liên kết lịch không hợp lệ'; end if;
  if (platform_name='airbnb' and url !~ '^https://(www\.)?airbnb\.com(/calendar/ical/|\.vn/calendar/ical/)[^[:space:]#@]+$') or
     (platform_name='booking' and url !~ '^https://(admin\.booking\.com/hotel/hoteladmin/ical\.html|ical\.booking\.com/)[^[:space:]#@]*$') or
     (platform_name='google' and url !~ '^https://calendar\.google\.com/calendar/ical/[^[:space:]#@]+$') or
     -- Other channels: HTTPS with a DNS host name, no credentials, port or fragment.
     -- The server additionally refuses hosts that resolve to private addresses.
     (url !~ '^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,63}/[^[:space:]#@]*$') then
   raise exception 'Dùng liên kết HTTPS xuất lịch (iCal) chính thức của đúng kênh'; end if;
  if not exists(select 1 from public.maoki_records where id=p and workspace_id=w and resource='properties') then raise exception 'Không tìm thấy phòng'; end if;
  if platform_name<>'ical' and exists(select 1 from maoki_private.channel_calendars where workspace_id=w and property_id=p and platform=platform_name) then raise exception 'Phòng đã kết nối kênh này. Gỡ kết nối cũ trước khi thay lịch'; end if;
  if exists(select 1 from maoki_private.channel_calendars where workspace_id=w and property_id=p and ical_url=url) then raise exception 'Liên kết lịch này đã được kết nối cho phòng'; end if;
  if (select count(*) from maoki_private.channel_calendars where workspace_id=w)>=200 then raise exception 'Đã đạt giới hạn 200 lịch kết nối'; end if;
  insert into maoki_private.channel_calendars(workspace_id,property_id,platform,ical_url,label) values(w,p,platform_name,url,label_text) returning * into c;
  perform maoki_private.audit(w,'connect','integrations',platform_name);
  return jsonb_build_object('id',c.id);
 end if;
 select * into c from maoki_private.channel_calendars where id=connection_id and workspace_id=w for update;
 if c.id is null then raise exception 'Không tìm thấy kết nối'; end if;
 if op='disconnect' then
  delete from maoki_private.channel_calendars where id=c.id;
  perform maoki_private.audit(w,'disconnect','integrations',c.platform);
  return '{"ok":true}';
 elsif op='claim' then
  if c.sync_started_at>now()-interval '45 seconds' then raise exception 'Lịch đang đồng bộ. Vui lòng chờ'; end if;
  perform maoki_private.budget(w,'ical_sync',20);
  update maoki_private.channel_calendars set sync_nonce=gen_random_uuid(),sync_started_at=now() where id=c.id returning * into c;
  return jsonb_build_object('nonce',c.sync_nonce,'url',c.ical_url,'platform',c.platform);
 elsif op in ('finish','fail') then
  if c.sync_nonce is null or c.sync_nonce::text<>coalesce(payload->>'nonce','') then raise exception 'Lượt đồng bộ đã hết hiệu lực'; end if;
  if op='fail' then
   update maoki_private.channel_calendars set sync_nonce=null,sync_started_at=null,last_error=left(coalesce(nullif(payload->>'reason',''),'Không tải được lịch. Kiểm tra liên kết và thử lại; lịch cũ vẫn được giữ.'),300) where id=c.id;
   return '{"ok":true}';
  end if;
  if coalesce(jsonb_typeof(payload->'events'),'null')<>'array' or jsonb_array_length(payload->'events')>2000 then raise exception 'Lịch quá lớn hoặc không hợp lệ'; end if;
  for item in select * from jsonb_array_elements(payload->'events') loop
   if jsonb_typeof(item)<>'object' or coalesce(item->>'uid','')='' or length(item->>'uid')>512 or
      coalesce(item->>'checkIn','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(item->>'checkOut','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Khoảng ngày không hợp lệ'; end if;
   if (item->>'checkOut')::date<=(item->>'checkIn')::date or (item->>'checkOut')::date-(item->>'checkIn')::date>3660 then raise exception 'Khoảng ngày không hợp lệ'; end if;
   if item->>'uid' like 'maoki-%@maokihouse' then continue; end if;
   insert into maoki_private.calendar_blocks(connection_id,workspace_id,property_id,external_uid,check_in,check_out)
   values(c.id,w,c.property_id,item->>'uid',(item->>'checkIn')::date,(item->>'checkOut')::date)
   on conflict on constraint calendar_blocks_connection_id_external_uid_key do update set check_in=excluded.check_in,check_out=excluded.check_out;
  end loop;
  delete from maoki_private.calendar_blocks b where b.connection_id=c.id and not exists(select 1 from jsonb_array_elements(payload->'events') e where e->>'uid'=b.external_uid);
  select count(*) into n from maoki_private.calendar_blocks where calendar_blocks.connection_id=c.id;
  select count(*) into conflicts from maoki_private.calendar_blocks b where b.connection_id=c.id and
   (exists(select 1 from public.maoki_records r where r.workspace_id=w and r.resource='bookings' and r.data->>'propertyId'=c.property_id::text and r.data->>'status'<>'cancelled' and r.data->>'source'<>c.platform and r.data->>'checkIn'<b.check_out::text and r.data->>'checkOut'>b.check_in::text)
    or exists(select 1 from maoki_private.calendar_blocks other where other.workspace_id=w and other.property_id=c.property_id and other.connection_id<>c.id and other.check_in<b.check_out and other.check_out>b.check_in));
  update maoki_private.channel_calendars set sync_nonce=null,sync_started_at=null,last_synced_at=now(),last_error='' where id=c.id;
  perform maoki_private.audit(w,'sync','integrations',c.platform || ': ' || n::text || ' khoảng ngày');
  return jsonb_build_object('synced',true,'blockCount',n,'conflictCount',conflicts);
 else raise exception 'Thao tác không được hỗ trợ'; end if;
end;
$$;

-- The export feed must leave out only blocks that came from the same feed, so a
-- generic iCal feed still receives blocks imported from other generic feeds.
create or replace function maoki_private.calendar_feed(feed_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c maoki_private.channel_calendars; result jsonb;
begin
 if feed_token is null or feed_token !~ '^[a-f0-9]{64}$' then return null; end if;
 select * into c from maoki_private.channel_calendars where export_token=feed_token;
 if c.id is null then return null; end if;
 perform maoki_private.budget(c.workspace_id,'ical_export',120);
 select coalesce(jsonb_agg(event),'[]') into result from (
  select jsonb_build_object('uid','maoki-'||r.id::text||'@maokihouse','checkIn',r.data->>'checkIn','checkOut',r.data->>'checkOut') as event
   from public.maoki_records r where r.workspace_id=c.workspace_id and r.resource='bookings' and r.data->>'propertyId'=c.property_id::text and r.data->>'status'<>'cancelled' and r.data->>'source'<>c.platform
  union all
  select jsonb_build_object('uid','maoki-'||b.id::text||'@maokihouse','checkIn',b.check_in,'checkOut',b.check_out)
   from maoki_private.calendar_blocks b join maoki_private.channel_calendars cc on cc.id=b.connection_id where b.workspace_id=c.workspace_id and b.property_id=c.property_id and cc.id<>c.id and (cc.platform<>c.platform or c.platform='ical')
  union all
  select jsonb_build_object('uid','maoki-rate-'||r.id::text||'-'||to_char(days.day,'YYYYMMDD')||'@maokihouse','checkIn',days.day::date,'checkOut',days.day::date+1)
   from generate_series(current_date,current_date+730,'1 day') as days(day)
   join lateral (select data,id from public.maoki_records where workspace_id=c.workspace_id and resource='rates' and data->>'propertyId'=c.property_id::text and data->>'startDate'<=days.day::date::text and data->>'endDate'>=days.day::date::text order by updated_at desc,id desc limit 1) r on r.data->>'closed'='true'
 ) q;
 if jsonb_array_length(result)>5000 then raise exception 'Lịch quá lớn'; end if;
 return jsonb_build_object('events',result);
end;
$$;

create or replace function maoki_private.no_conflict(w uuid, record_id uuid, d jsonb) returns void language plpgsql set search_path='' as $$
begin
 if d->>'status'='cancelled' then return; end if;
 if not exists(select 1 from public.maoki_records where workspace_id=w and resource='properties' and id::text=d->>'propertyId' and data->>'status'='active') then raise exception 'Phòng chưa hoạt động'; end if;
 if exists(select 1 from public.maoki_records where workspace_id=w and resource='bookings' and id<>record_id and data->>'propertyId'=d->>'propertyId' and data->>'status'<>'cancelled' and data->>'checkIn'<d->>'checkOut' and data->>'checkOut'>d->>'checkIn') then raise exception 'Phòng đã có đặt chỗ trong khoảng ngày này'; end if;
 if exists(select 1 from maoki_private.calendar_blocks where workspace_id=w and property_id::text=d->>'propertyId' and check_in<(d->>'checkOut')::date and check_out>(d->>'checkIn')::date) then raise exception 'Phòng đã bận theo lịch iCal của một kênh đã kết nối. Kiểm tra mục Kết nối kênh'; end if;
end;
$$;

-- 2. AI settings (OpenRouter) --------------------------------------------------
create table maoki_private.ai_settings (
 workspace_id uuid primary key references public.maoki_workspaces(id) on delete cascade,
 api_key text not null default '' check(api_key='' or api_key ~ '^sk-or-[A-Za-z0-9_-]{16,200}$'),
 model text not null default 'nvidia/nemotron-3.5-super-vl:free' check(length(model)<=120 and model ~ '^[A-Za-z0-9._-]+/[A-Za-z0-9._:-]+$'),
 allow_agents boolean not null default false,
 updated_at timestamptz not null default now(),
 updated_by text not null default ''
);
alter table maoki_private.ai_settings enable row level security;
revoke all on maoki_private.ai_settings from public,anon,authenticated;

create function maoki_private.ai_settings(op text, payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); w uuid; member_role text; s maoki_private.ai_settings; new_key text; new_model text;
begin
 if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Vui lòng đăng nhập'; end if;
 if jsonb_typeof(payload)<>'object' or octet_length(payload::text)>4000 then raise exception 'Yêu cầu không hợp lệ'; end if;
 select workspace_id,role into w,member_role from public.maoki_members where user_id=uid and is_current;
 if w is null then raise exception 'Hãy mở không gian quản lý trước'; end if;
 select * into s from maoki_private.ai_settings where workspace_id=w;
 if op='status' then
  -- Never includes the key itself: only whether one is saved and its last 4 characters.
  return jsonb_build_object('configured',coalesce(s.api_key,'')<>'','keyHint',case when coalesce(s.api_key,'')<>'' then right(s.api_key,4) else '' end,
   'model',coalesce(s.model,'nvidia/nemotron-3.5-super-vl:free'),'allowAgents',coalesce(s.allow_agents,false),'updatedAt',s.updated_at,'updatedBy',coalesce(s.updated_by,''),
   'canManage',member_role in ('owner','manager'),'canUse',member_role in ('owner','manager') or (member_role='agent' and coalesce(s.allow_agents,false)));
 end if;
 if op in ('secret','use') then
  -- Every provider call goes through one of these, so role, staff permission and the durable
  -- per-workspace budget apply whichever key (workspace or server) pays for the request.
  if member_role not in ('owner','manager','agent') then raise exception 'Vai trò hiện tại chưa được sử dụng trợ lý AI'; end if;
  if member_role='agent' and not coalesce(s.allow_agents,false) then raise exception 'Chủ không gian chưa cho phép nhân viên dùng trợ lý AI'; end if;
  perform maoki_private.budget(w,'ai',12);
  if op='use' then return '{"ok":true}'; end if;
  return jsonb_build_object('apiKey',coalesce(s.api_key,''),'model',coalesce(s.model,'nvidia/nemotron-3.5-super-vl:free'));
 end if;
 if member_role not in ('owner','manager') then raise exception 'Chỉ chủ không gian và quản lý được thay đổi cài đặt AI'; end if;
 perform maoki_private.budget(w,'ai_settings',10);
 if op='save' then
  new_key:=nullif(trim(coalesce(payload->>'apiKey','')),'');
  new_model:=nullif(trim(coalesce(payload->>'model','')),'');
  if new_key is not null and new_key !~ '^sk-or-[A-Za-z0-9_-]{16,200}$' then raise exception 'API key OpenRouter phải bắt đầu bằng sk-or-'; end if;
  if new_model is not null and (length(new_model)>120 or new_model !~ '^[A-Za-z0-9._-]+/[A-Za-z0-9._:-]+$') then raise exception 'Tên model không hợp lệ. Ví dụ: nvidia/nemotron-3.5-super-vl:free'; end if;
  if payload ? 'allowAgents' and jsonb_typeof(payload->'allowAgents')<>'boolean' then raise exception 'Yêu cầu không hợp lệ'; end if;
  insert into maoki_private.ai_settings(workspace_id,api_key,model,allow_agents,updated_at,updated_by)
   values(w,coalesce(new_key,''),coalesce(new_model,'nvidia/nemotron-3.5-super-vl:free'),coalesce((payload->>'allowAgents')::boolean,false),now(),coalesce(auth.jwt()->>'email',''))
   on conflict(workspace_id) do update set
    api_key=coalesce(new_key,ai_settings.api_key),
    model=coalesce(new_model,ai_settings.model),
    allow_agents=case when payload ? 'allowAgents' then (payload->>'allowAgents')::boolean else ai_settings.allow_agents end,
    updated_at=now(),updated_by=coalesce(auth.jwt()->>'email','');
  perform maoki_private.audit(w,'update','ai',case when new_key is not null then 'Cập nhật API key OpenRouter' else 'Cập nhật cài đặt AI' end);
  return '{"ok":true}';
 elsif op='clear' then
  update maoki_private.ai_settings set api_key='',updated_at=now(),updated_by=coalesce(auth.jwt()->>'email','') where workspace_id=w;
  perform maoki_private.audit(w,'delete','ai','Xóa API key OpenRouter');
  return '{"ok":true}';
 else raise exception 'Thao tác không được hỗ trợ'; end if;
end;
$$;
create function public.maoki_ai_settings(op text, payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select maoki_private.ai_settings(op,payload) $$;
revoke all on function maoki_private.ai_settings(text,jsonb),public.maoki_ai_settings(text,jsonb) from public,anon;
grant execute on function maoki_private.ai_settings(text,jsonb),public.maoki_ai_settings(text,jsonb) to authenticated;
commit;
