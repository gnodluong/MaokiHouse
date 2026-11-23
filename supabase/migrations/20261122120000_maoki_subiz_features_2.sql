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
