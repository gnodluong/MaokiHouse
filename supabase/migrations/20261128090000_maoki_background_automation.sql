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
