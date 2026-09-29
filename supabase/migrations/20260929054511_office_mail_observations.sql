-- Owner-authorised new-mail observation only. No send/payment/approval capability.
create table office_private.mail_watch_state (
 singleton boolean primary key default true check(singleton),
 started_at timestamptz not null default now(), last_scan_at timestamptz,
 last_review_at timestamptz, heartbeat_at timestamptz, status text not null default 'waiting_mac',
 pending integer not null default 0, error_type text,
 constraint mail_watch_status check(status in ('waiting_mac','checking','ok','error'))
);
insert into office_private.mail_watch_state(singleton) values(true);
create table office_private.mail_observations (
 message_id text primary key check(message_id ~ '^[a-fA-F0-9]{1,64}$'),
 thread_id text not null check(thread_id ~ '^[a-fA-F0-9]{1,64}$'),
 received_at timestamptz not null, observed_at timestamptz not null default now(),
 needs_attention boolean not null, result jsonb not null, device_id uuid not null references office_private.mac_devices(id)
);
alter table office_private.mail_watch_state enable row level security;
alter table office_private.mail_observations enable row level security;
revoke all on office_private.mail_watch_state,office_private.mail_observations from public,anon,authenticated;

create function office_private.mail_watch_exchange(p_token text,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare device office_private.mac_devices%rowtype; enabled boolean; mode text; r jsonb; result text; body text;
 mid text; tid text; item public.office_company_records%rowtype; before_data jsonb; link office_private.detected_work%rowtype;
begin
 -- Same separately revocable device capability used by the existing Mac worker.
 if p_token is null or length(p_token)<40 or length(p_token)>128 then raise exception 'Device authentication required';end if;
 select * into device from office_private.mac_devices d where d.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and not d.revoked;
 if not found or not exists(select 1 from public.profiles p where p.id=device.owner_id and p.role::text='admin' and coalesce(p.is_active,true)) then raise exception 'Device authentication required';end if;
 if auth.uid() is not null and auth.uid()<>device.owner_id then raise exception 'Device owner mismatch';end if;
 select m.enabled into enabled from office_private.monitor_state m where singleton;
 mode=p_request->>'action';
 if mode='status' then return (select to_jsonb(s)-'singleton' from office_private.mail_watch_state s where singleton)||jsonb_build_object('enabled',enabled);end if;
 -- Pause also stops new observations from an already running reader. The Mac
 -- retains its result and publishes it only when checks are resumed.
 if not enabled then return jsonb_build_object('ok',false,'paused',true);end if;
 if mode='heartbeat' then
  if coalesce(p_request->>'status','') not in ('checking','ok','error') or coalesce((p_request->>'pending')::int,-1) not between 0 and 100000 then raise exception 'Invalid mail health';end if;
  update office_private.mail_watch_state set status=p_request->>'status',pending=(p_request->>'pending')::int,heartbeat_at=now(),
   last_scan_at=coalesce((p_request->>'last_scan_at')::timestamptz,last_scan_at),error_type=left(p_request->>'error_type',60) where singleton;
  return jsonb_build_object('ok',true);
 end if;
 if mode<>'observe' or pg_column_size(p_request)>24000 then raise exception 'Unsupported mail observation';end if;
 mid=p_request->>'message_id';tid=p_request->>'thread_id';r=p_request->'result';
 if coalesce(mid,'')!~'^[a-fA-F0-9]{1,64}$' or coalesce(tid,'')!~'^[a-fA-F0-9]{1,64}$' then raise exception 'Invalid mail identity';end if;
 if jsonb_typeof(r) is distinct from 'object' or jsonb_typeof(r->'needsAttention') is distinct from 'boolean'
  or coalesce(r->>'priority','') not in ('low','normal','high','urgent')
  or coalesce(length(r->>'title'),0) not between 2 and 160 or coalesce(length(r->>'summary'),0) not between 1 and 1500
  or coalesce(length(r->>'nextAction'),-1) not between 0 and 500 or coalesce(length(r->>'preparedReply'),-1) not between 0 and 1600
  or jsonb_typeof(r->'issues') is distinct from 'array' then raise exception 'Invalid mail preparation';end if;
 if (r->>'needsAttention')::boolean and coalesce(length(trim(r->>'nextAction')),0)=0 then raise exception 'Next action required';end if;
 if jsonb_array_length(r->'issues')>12 or exists(select 1 from jsonb_array_elements(r->'issues') x where jsonb_typeof(x)<>'string' or length(x#>>'{}')>250) then raise exception 'Invalid coverage issues';end if;
 perform pg_advisory_xact_lock(917269);
 if exists(select 1 from office_private.mail_observations where message_id=mid) then return jsonb_build_object('ok',true,'duplicate',true);end if;
 insert into office_private.mail_observations(message_id,thread_id,received_at,needs_attention,result,device_id)
 values(mid,tid,(p_request->>'received_at')::timestamptz,(r->>'needsAttention')::boolean,r,device.id);
 if (r->>'needsAttention')::boolean and not exists(
  select 1 from office_private.detected_work l join public.office_company_records w on w.id=l.record_id
  where l.issue_key='mail:'||tid and (w.detection#>>'{evidence,receivedAt}')::timestamptz>(p_request->>'received_at')::timestamptz
 ) then
  body=(r->>'summary')||case when r->>'preparedReply'<>'' then E'\n\nPrepared reply — not sent or attached:\n'||(r->>'preparedReply') else '' end;
  if jsonb_array_length(r->'issues')>0 then body=body||E'\n\nCoverage / review:\n'||(select string_agg(x,E'\n') from jsonb_array_elements_text(r->'issues') x);end if;
  if length(body)>4000 then body=left(body,3920)||E'\n[Further coverage issues are in the detected evidence.]';end if;
  result=office_private.detect_work(device.owner_id,'mail:'||tid,'incoming_mail',r->>'title',body,r->>'nextAction',
   'https://mail.google.com/mail/u/work@stillpartners.net/#all/'||mid,
   jsonb_build_object('messageId',mid,'threadId',tid,'receivedAt',p_request->>'received_at','subject',left(p_request->>'subject',160),'priority',r->>'priority','issues',r->'issues','preparedReply',r->>'preparedReply'));
  select * into link from office_private.detected_work where issue_key='mail:'||tid;
  select * into item from public.office_company_records where id=link.record_id for update;
  -- Preserve owner priority changes as well as their notes and completion history.
  if item.version=link.last_record_version and item.priority<>r->>'priority' then
   before_data=to_jsonb(item);
   update public.office_company_records set priority=r->>'priority',version=version+1,updated_at=now(),updated_by=device.owner_id where id=item.id returning * into item;
   update office_private.detected_work set last_record_version=item.version where issue_key='mail:'||tid;
   insert into public.office_company_record_events(id,record_id,actor_id,request,before_data,after_data)
   values(gen_random_uuid(),item.id,device.owner_id,jsonb_build_object('automation','mail_priority','messageId',mid),before_data,to_jsonb(item));
  end if;
 end if;
 update office_private.mail_watch_state set last_review_at=now(),heartbeat_at=now(),error_type=null where singleton;
 return jsonb_build_object('ok',true,'work',result);
end;$$;
revoke all on function office_private.mail_watch_exchange(text,jsonb) from public;
grant execute on function office_private.mail_watch_exchange(text,jsonb) to anon,authenticated;
create function public.office_mail_watch_exchange(p_token text,p_request jsonb) returns jsonb language sql security invoker set search_path='' as $$select office_private.mail_watch_exchange(p_token,p_request);$$;
revoke all on function public.office_mail_watch_exchange(text,jsonb) from public;
grant execute on function public.office_mail_watch_exchange(text,jsonb) to anon,authenticated;

create or replace function office_private.monitor_control(p_enabled boolean default null,p_scan boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Finance admin required';end if;
 if p_enabled is not null then update office_private.monitor_state set enabled=p_enabled where singleton;end if;
 if p_scan then perform office_private.scan_work(auth.uid());perform office_private.scan_document_expiry(auth.uid());end if;
 return (select to_jsonb(s)-'singleton' from office_private.monitor_state s where singleton)||jsonb_build_object('mail',(select to_jsonb(m)-'singleton' from office_private.mail_watch_state m where singleton));
end;$$;
