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