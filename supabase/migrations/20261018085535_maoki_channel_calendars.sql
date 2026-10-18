-- Private iCal connection credentials, availability blocks and checked RPCs.
-- Imported blocks are not bookings, revenue or guest records.
begin;
create table maoki_private.channel_calendars (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.maoki_workspaces(id) on delete cascade,
 property_id uuid not null references public.maoki_records(id),
 platform text not null check(platform in ('airbnb','booking')),
 ical_url text not null check(length(ical_url) between 10 and 4096),
 export_token text not null unique default replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
 sync_nonce uuid, sync_started_at timestamptz, last_synced_at timestamptz,
 last_error text not null default '', created_at timestamptz not null default now(),
 unique(workspace_id,property_id,platform)
);
create table maoki_private.calendar_blocks (
 id uuid primary key default gen_random_uuid(),
 connection_id uuid not null references maoki_private.channel_calendars(id) on delete cascade,
 workspace_id uuid not null references public.maoki_workspaces(id) on delete cascade,
 property_id uuid not null references public.maoki_records(id),
 external_uid text not null check(length(external_uid) between 1 and 512),
 check_in date not null, check_out date not null check(check_out>check_in),
 unique(connection_id,external_uid)
);
create index maoki_calendar_block_property on maoki_private.calendar_blocks(workspace_id,property_id,check_in,check_out);
alter table maoki_private.channel_calendars enable row level security;
alter table maoki_private.calendar_blocks enable row level security;
revoke all on maoki_private.channel_calendars,maoki_private.calendar_blocks from public,anon,authenticated;

create function maoki_private.channels(op text, connection_id uuid, payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); w uuid; member_role text; c maoki_private.channel_calendars; item jsonb; result jsonb; n integer; conflicts integer; platform_name text; p uuid; url text;
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
  return (select coalesce(jsonb_agg(jsonb_build_object('id',cc.id,'propertyId',cc.property_id,'platform',cc.platform,'exportToken',cc.export_token,'lastSyncedAt',cc.last_synced_at,'lastError',cc.last_error,'blockCount',(select count(*) from maoki_private.calendar_blocks where calendar_blocks.connection_id=cc.id)) order by cc.created_at),'[]') from maoki_private.channel_calendars cc where cc.workspace_id=w);
 end if;
 if op='save' then
  platform_name:=payload->>'platform'; p:=(payload->>'propertyId')::uuid; url:=trim(payload->>'url');
  if platform_name is null or platform_name not in ('airbnb','booking') or length(url) not between 10 and 4096 then raise exception 'Liên kết lịch không hợp lệ'; end if;
  if (platform_name='airbnb' and url !~ '^https://(www\.)?airbnb\.com(/calendar/ical/|\.vn/calendar/ical/)[^[:space:]#@]+$') or
     (platform_name='booking' and url !~ '^https://(admin\.booking\.com/hotel/hoteladmin/ical\.html|ical\.booking\.com/)[^[:space:]#@]*$') then raise exception 'Dùng liên kết xuất lịch chính thức của đúng kênh'; end if;
  if not exists(select 1 from public.maoki_records where id=p and workspace_id=w and resource='properties') then raise exception 'Không tìm thấy phòng'; end if;
  if exists(select 1 from maoki_private.channel_calendars where workspace_id=w and property_id=p and platform=platform_name) then raise exception 'Phòng đã kết nối kênh này. Gỡ kết nối cũ trước khi thay lịch'; end if;
  insert into maoki_private.channel_calendars(workspace_id,property_id,platform,ical_url) values(w,p,platform_name,url) returning * into c;
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
  perform maoki_private.budget(w,'ical_sync',10);
  update maoki_private.channel_calendars set sync_nonce=gen_random_uuid(),sync_started_at=now() where id=c.id returning * into c;
  return jsonb_build_object('nonce',c.sync_nonce,'url',c.ical_url,'platform',c.platform);
 elsif op in ('finish','fail') then
  if c.sync_nonce is null or c.sync_nonce::text<>coalesce(payload->>'nonce','') then raise exception 'Lượt đồng bộ đã hết hiệu lực'; end if;
  if op='fail' then
   update maoki_private.channel_calendars set sync_nonce=null,sync_started_at=null,last_error='Không tải được lịch. Kiểm tra liên kết và thử lại; lịch cũ vẫn được giữ.' where id=c.id;
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
create function public.maoki_channels(op text,connection_id uuid default null,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select maoki_private.channels(op,connection_id,payload) $$;
revoke all on function maoki_private.channels(text,uuid,jsonb),public.maoki_channels(text,uuid,jsonb) from public,anon;
grant execute on function maoki_private.channels(text,uuid,jsonb),public.maoki_channels(text,uuid,jsonb) to authenticated;

create function maoki_private.calendar_feed(feed_token text) returns jsonb language plpgsql security definer set search_path='' as $$
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
   from maoki_private.calendar_blocks b join maoki_private.channel_calendars cc on cc.id=b.connection_id where b.workspace_id=c.workspace_id and b.property_id=c.property_id and cc.platform<>c.platform
  union all
  select jsonb_build_object('uid','maoki-rate-'||r.id::text||'-'||to_char(days.day,'YYYYMMDD')||'@maokihouse','checkIn',days.day::date,'checkOut',days.day::date+1)
   from generate_series(current_date,current_date+730,'1 day') as days(day)
   join lateral (select data,id from public.maoki_records where workspace_id=c.workspace_id and resource='rates' and data->>'propertyId'=c.property_id::text and data->>'startDate'<=days.day::date::text and data->>'endDate'>=days.day::date::text order by updated_at desc,id desc limit 1) r on r.data->>'closed'='true'
 ) q;
 if jsonb_array_length(result)>5000 then raise exception 'Lịch quá lớn'; end if;
 return jsonb_build_object('events',result);
end;
$$;
create function public.maoki_calendar_feed(feed_token text) returns jsonb language sql security invoker set search_path='' as $$ select maoki_private.calendar_feed(feed_token) $$;
revoke all on function maoki_private.calendar_feed(text),public.maoki_calendar_feed(text) from public;
grant execute on function maoki_private.calendar_feed(text),public.maoki_calendar_feed(text) to anon,authenticated;

create or replace function maoki_private.no_conflict(w uuid, record_id uuid, d jsonb) returns void language plpgsql set search_path='' as $$
begin
 if d->>'status'='cancelled' then return; end if;
 if not exists(select 1 from public.maoki_records where workspace_id=w and resource='properties' and id::text=d->>'propertyId' and data->>'status'='active') then raise exception 'Phòng chưa hoạt động'; end if;
 if exists(select 1 from public.maoki_records where workspace_id=w and resource='bookings' and id<>record_id and data->>'propertyId'=d->>'propertyId' and data->>'status'<>'cancelled' and data->>'checkIn'<d->>'checkOut' and data->>'checkOut'>d->>'checkIn') then raise exception 'Phòng đã có đặt chỗ trong khoảng ngày này'; end if;
 if exists(select 1 from maoki_private.calendar_blocks where workspace_id=w and property_id::text=d->>'propertyId' and check_in<(d->>'checkOut')::date and check_out>(d->>'checkIn')::date) then raise exception 'Phòng đã bận theo lịch iCal. Kiểm tra Airbnb / Booking.com'; end if;
end;
$$;
create or replace function maoki_private.quote(w uuid,p uuid,ci text,co text) returns jsonb language plpgsql set search_path='' as $$
declare stay jsonb; rate jsonb; day date; total numeric:=0; night_count integer;
begin
 if ci !~ '^\d{4}-\d{2}-\d{2}$' or co !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Ngày không hợp lệ'; end if;
 night_count:=co::date-ci::date;
 if ci::date<(now() at time zone 'Asia/Ho_Chi_Minh')::date or night_count not between 1 and 90 then raise exception 'Chọn kỳ nghỉ từ 1 đến 90 đêm, từ hôm nay'; end if;
 select data into stay from public.maoki_records where workspace_id=w and id=p and resource='properties' and data->>'published'='true' and data->>'status'='active';
 if stay is null then raise exception 'Không tìm thấy phòng đang mở đặt chỗ'; end if;
 perform maoki_private.no_conflict(w,'00000000-0000-0000-0000-000000000000',jsonb_build_object('propertyId',p,'status','confirmed','checkIn',ci,'checkOut',co));
 for day in select generate_series(ci::date,co::date-1,'1 day')::date loop
  select data into rate from public.maoki_records where workspace_id=w and resource='rates' and data->>'propertyId'=p::text and data->>'startDate'<=day::text and data->>'endDate'>=day::text order by updated_at desc,id desc limit 1;
  if coalesce((rate->>'closed')::boolean,false) then raise exception 'Phòng tạm đóng trong ngày đã chọn'; end if;
  if night_count<coalesce((rate->>'minNights')::integer,1) then raise exception 'Kỳ nghỉ chưa đạt số đêm tối thiểu'; end if;
  total:=total+coalesce((rate->>'nightlyRate')::numeric,(stay->>'basePrice')::numeric);
 end loop;
 return jsonb_build_object('nights',night_count,'total',total,'currency',(select settings->>'currency' from public.maoki_workspaces where id=w));
end;
$$;
commit;
