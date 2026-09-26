alter table public.office_assistant_tasks add column kind text not null default 'chat' check(kind in ('chat','invoice_check'));
create unique index office_one_open_invoice_check on public.office_assistant_tasks(user_id) where kind='invoice_check' and status in ('queued','running');
create or replace function office_private.assistant_exchange(p_token text,p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare device office_private.mac_devices%rowtype; task public.office_assistant_tasks%rowtype; lease uuid;
begin
 if p_token is null or length(p_token)<40 or length(p_token)>128 then raise exception 'Device authentication required'; end if;
 select * into device from office_private.mac_devices d where d.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and not d.revoked;
 if not found or not exists(select 1 from public.profiles p where p.id=device.owner_id and p.role::text='admin' and coalesce(p.is_active,true)) then raise exception 'Device authentication required'; end if;
 if auth.uid() is not null and auth.uid()<>device.owner_id then raise exception 'Device owner mismatch'; end if;
 if p_request->>'action'='claim' then
  select * into task from public.office_assistant_tasks t where t.user_id=device.owner_id and (t.status='queued' or (t.status='running' and t.started_at<now()-interval '10 minutes')) and exists(select 1 from public.profiles p where p.id=t.user_id and p.role::text='admin' and coalesce(p.is_active,true)) order by t.created_at for update skip locked limit 1;
  if not found then return '{}'::jsonb; end if;
  lease=gen_random_uuid();update public.office_assistant_tasks set status='running',lease_id=lease,started_at=now() where id=task.id;
  return jsonb_build_object('id',task.id,'kind',task.kind,'prompt',task.prompt,'context',task.context,'lease_id',lease);
 elsif p_request->>'action'='complete' then
  if coalesce(p_request->>'status','') not in ('done','error') or jsonb_typeof(p_request->'response') is distinct from 'object' or pg_column_size(p_request->'response')>20000 then raise exception 'Invalid assistant result'; end if;
  update public.office_assistant_tasks set status=p_request->>'status',response=p_request->'response',finished_at=now() where id=(p_request->>'id')::uuid and lease_id=(p_request->>'lease_id')::uuid and status='running';
  return jsonb_build_object('ok',found);
 end if;
 raise exception 'Unsupported assistant action';
end;$$;
