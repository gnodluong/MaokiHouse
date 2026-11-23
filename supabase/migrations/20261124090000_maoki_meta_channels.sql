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
