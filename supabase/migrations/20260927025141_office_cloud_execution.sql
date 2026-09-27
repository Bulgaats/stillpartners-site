-- Cloud jobs remain disabled until server environment and owner connections are configured.
alter table public.office_assistant_tasks add column executor text not null default 'mac' check(executor in ('mac','cloud'));
alter table public.office_assistant_tasks add column cloud_attempts integer not null default 0 check(cloud_attempts between 0 and 3);
alter table public.office_assistant_tasks add column cloud_error text;
drop policy assistant_submit on public.office_assistant_tasks;
create policy assistant_submit on public.office_assistant_tasks for insert to authenticated
with check((select public.is_admin()) and user_id=(select auth.uid()) and status='queued' and response is null and lease_id is null and applied_id is null and applied_at is null and started_at is null and finished_at is null and cloud_attempts=0 and cloud_error is null and (executor='mac' or kind='chat'));
create table public.office_cloud_mailboxes(
 owner_id uuid primary key references auth.users(id),
 account text not null check(account='work@stillpartners.net'),
 encrypted_token text not null check(length(encrypted_token)<20000),
 connected_at timestamptz not null default now()
);
alter table public.office_cloud_mailboxes enable row level security;
revoke all on public.office_cloud_mailboxes from public,anon,authenticated;
grant all on public.office_cloud_mailboxes to service_role;
create index office_cloud_queue on public.office_assistant_tasks(user_id,executor,status,created_at);

create function office_private.cloud_exchange(p_owner uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare task public.office_assistant_tasks%rowtype; v_lease uuid; used integer; cap integer;
begin
 if not exists(select 1 from public.profiles where id=p_owner and role::text='admin' and coalesce(is_active,true)) then raise exception 'Finance admin access required'; end if;
 if p_request->>'action'='claim' then
  cap=(p_request->>'dailyLimit')::integer;
  if cap is null or cap<1 or cap>500 then raise exception 'Configure daily request limit';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,82726));
  select * into task from public.office_assistant_tasks where id=(p_request->>'id')::uuid and user_id=p_owner and executor='cloud' and kind='chat' and (status='queued' or (status='running' and started_at<now()-interval '6 minutes')) for update skip locked;
  if not found then return '{}'::jsonb;end if;
  if task.cloud_attempts>=3 then
   update public.office_assistant_tasks set status='error',cloud_error='Cloud recovery limit reached. Review and submit a new request.',finished_at=now() where id=task.id;
   return '{}'::jsonb;
  end if;
  select coalesce(sum(cloud_attempts),0) into used from public.office_assistant_tasks
    where user_id=p_owner and executor='cloud' and started_at>=date_trunc('day',now() at time zone 'Australia/Perth') at time zone 'Australia/Perth';
  if used>=cap then
   update public.office_assistant_tasks set status='error',cloud_error='Configured daily cloud request limit reached.',finished_at=now() where id=task.id;
   return '{}'::jsonb;
  end if;
  v_lease=gen_random_uuid();
  update public.office_assistant_tasks set status='running',lease_id=v_lease,started_at=now(),cloud_attempts=cloud_attempts+1,cloud_error=null where id=task.id;
  return jsonb_build_object('id',task.id,'prompt',task.prompt,'context',task.context,'lease_id',v_lease);
 elsif p_request->>'action'='complete' then
  if coalesce(p_request->>'status','') not in ('done','error') or jsonb_typeof(p_request->'response') is distinct from 'object' or pg_column_size(p_request->'response')>180000 then raise exception 'Invalid cloud result';end if;
  update public.office_assistant_tasks set status=p_request->>'status',response=p_request->'response',cloud_error=left(p_request->>'error',500),finished_at=now()
   where id=(p_request->>'id')::uuid and user_id=p_owner and executor='cloud' and status='running' and lease_id=(p_request->>'lease_id')::uuid;
  return jsonb_build_object('ok',found);
 end if;
 raise exception 'Unsupported cloud action';
end;$$;
revoke all on function office_private.cloud_exchange(uuid,jsonb) from public,anon,authenticated;
grant usage on schema office_private to service_role;
grant execute on function office_private.cloud_exchange(uuid,jsonb) to service_role;
create function public.office_cloud_exchange(p_owner uuid,p_request jsonb) returns jsonb language sql security invoker set search_path='' as $$select office_private.cloud_exchange(p_owner,p_request);$$;
revoke all on function public.office_cloud_exchange(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.office_cloud_exchange(uuid,jsonb) to service_role;

CREATE OR REPLACE FUNCTION office_private.assistant_exchange(p_token text, p_request jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare device office_private.mac_devices%rowtype; task public.office_assistant_tasks%rowtype; lease uuid;
begin
 if p_token is null or length(p_token)<40 or length(p_token)>128 then raise exception 'Device authentication required'; end if;
 select * into device from office_private.mac_devices d where d.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and not d.revoked;
 if not found or not exists(select 1 from public.profiles p where p.id=device.owner_id and p.role::text='admin' and coalesce(p.is_active,true)) then raise exception 'Device authentication required'; end if;
 if auth.uid() is not null and auth.uid()<>device.owner_id then raise exception 'Device owner mismatch'; end if;
 if p_request->>'action'='claim' then
  select * into task from public.office_assistant_tasks t where t.user_id=device.owner_id and t.executor='mac' and (t.status='queued' or (t.status='running' and t.started_at<now()-interval '10 minutes')) and exists(select 1 from public.profiles p where p.id=t.user_id and p.role::text='admin' and coalesce(p.is_active,true)) order by t.created_at for update skip locked limit 1;
  if not found then return '{}'::jsonb; end if;
  lease=gen_random_uuid();update public.office_assistant_tasks set status='running',lease_id=lease,started_at=now() where id=task.id;
  return jsonb_build_object('id',task.id,'kind',task.kind,'prompt',task.prompt,'context',task.context,'lease_id',lease);
 elsif p_request->>'action'='complete' then
  if coalesce(p_request->>'status','') not in ('done','error') or jsonb_typeof(p_request->'response') is distinct from 'object' or pg_column_size(p_request->'response')>180000 then raise exception 'Invalid assistant result'; end if;
  update public.office_assistant_tasks set status=p_request->>'status',response=p_request->'response',finished_at=now() where id=(p_request->>'id')::uuid and lease_id=(p_request->>'lease_id')::uuid and status='running' and user_id=device.owner_id and executor='mac';
  return jsonb_build_object('ok',found);
 end if;
 raise exception 'Unsupported assistant action';
end;$function$;
