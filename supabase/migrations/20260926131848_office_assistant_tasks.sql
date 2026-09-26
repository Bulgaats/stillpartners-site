create table public.office_assistant_tasks (
 id uuid primary key, user_id uuid not null references auth.users(id), prompt text not null check(length(prompt) between 1 and 4000),
 context jsonb not null check(jsonb_typeof(context)='object' and pg_column_size(context)<=1000000), status text not null default 'queued' check(status in ('queued','running','done','error')),
 response jsonb, lease_id uuid, started_at timestamptz, finished_at timestamptz, created_at timestamptz not null default now(),
 applied_id uuid, applied_at timestamptz
);
alter table public.office_assistant_tasks enable row level security;
revoke all on public.office_assistant_tasks from anon,authenticated;
grant select,insert on public.office_assistant_tasks to authenticated;
create policy assistant_read on public.office_assistant_tasks for select to authenticated using((select public.is_admin()) and user_id=(select auth.uid()));
create policy assistant_submit on public.office_assistant_tasks for insert to authenticated with check((select public.is_admin()) and user_id=(select auth.uid()) and status='queued' and response is null and lease_id is null and applied_id is null and applied_at is null and started_at is null and finished_at is null);
create index assistant_queue on public.office_assistant_tasks(status,created_at);
create function office_private.assistant_exchange(p_token text,p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
  return jsonb_build_object('id',task.id,'prompt',task.prompt,'context',task.context,'lease_id',lease);
 elsif p_request->>'action'='complete' then
  if coalesce(p_request->>'status','') not in ('done','error') or jsonb_typeof(p_request->'response') is distinct from 'object' or pg_column_size(p_request->'response')>20000 then raise exception 'Invalid assistant result'; end if;
  update public.office_assistant_tasks set status=p_request->>'status',response=p_request->'response',finished_at=now() where id=(p_request->>'id')::uuid and lease_id=(p_request->>'lease_id')::uuid and status='running';
  return jsonb_build_object('ok',found);
 end if;
 raise exception 'Unsupported assistant action';
end;$$;
revoke all on function office_private.assistant_exchange(text,jsonb) from public;
grant execute on function office_private.assistant_exchange(text,jsonb) to anon,authenticated;
create function public.office_assistant_exchange(p_token text,p_request jsonb) returns jsonb language sql security invoker set search_path='' as $$select office_private.assistant_exchange(p_token,p_request);$$;
revoke all on function public.office_assistant_exchange(text,jsonb) from public;
grant execute on function public.office_assistant_exchange(text,jsonb) to anon,authenticated;
create function office_private.apply_assistant_task(p_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare task public.office_assistant_tasks%rowtype; r jsonb; kind text; v_name text; email text; abn text; client uuid; created uuid; abn_total integer; i integer; weights integer[]=array[10,1,3,5,7,9,11,13,15,17,19];
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Finance admin access required'; end if;
 perform pg_advisory_xact_lock(917264);
 select * into task from public.office_assistant_tasks where id=p_id and user_id=auth.uid() for update;
 if not found or task.status<>'done' then raise exception 'Completed request not found'; end if;
 if task.applied_id is not null then return task.applied_id; end if;
 r=task.response;kind=r->>'action';v_name=trim(r->>'name');email=trim(coalesce(r->>'email',''));abn=regexp_replace(coalesce(r->>'abn',''),'\s','','g');
 if v_name is null or length(v_name)<2 or length(v_name)>160 or length(email)>254 or (email<>'' and email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$') then raise exception 'Check the proposed name and email'; end if;
 if kind='create_client' then
  if abn<>'' then
   if abn !~ '^[0-9]{11}$' then raise exception 'Check the client ABN'; end if;
   abn_total=-10; for i in 1..11 loop abn_total=abn_total+substr(abn,i,1)::integer*weights[i]; end loop;
   if abn_total%89<>0 then raise exception 'Check the client ABN'; end if;
  end if;
  if exists(select 1 from public.clients where lower(trim(clients.name))=lower(v_name)) then raise exception 'Client already exists'; end if;
  insert into public.clients(name,billing_email,email,abn,is_active,payment_terms_days) values(v_name,nullif(email,''),nullif(email,''),nullif(abn,''),true,14) returning id into created;
 elsif kind='create_site' then
  client=(r->>'clientId')::uuid;
  if not exists(select 1 from public.clients where id=client and is_active) or length(trim(coalesce(r->>'address','')))<2 or length(r->>'address')>240 then raise exception 'Choose an active client and a site address'; end if;
  if exists(select 1 from public.jobs where client_id=client and lower(trim(coalesce(site_name,title)))=lower(v_name)) then raise exception 'Site already exists for this client'; end if;
  insert into public.jobs(client_id,title,site_name,location,status,project_status,created_by) values(client,v_name,v_name,r->>'address','active','active',auth.uid()) returning id into created;
 elsif kind='create_contractor' then
  if exists(select 1 from public.workers w where lower(trim(w.full_name))=lower(v_name) and coalesce(regexp_replace(w.abn,'\s','','g'),'')=abn) then raise exception 'This contractor is already registered'; end if;
  if coalesce(r->>'group','') not in ('regular','occasional') or length(coalesce(r->>'phone',''))>40 then raise exception 'Check contractor details'; end if;
  created=public.office_save_contractor(null,v_name,email,coalesce(r->>'phone',''),abn,r->>'group',true);
 else raise exception 'This request has no supported record to create';
 end if;
 update public.office_assistant_tasks set applied_id=created,applied_at=now() where id=p_id;
 return created;
end;$$;
revoke all on function office_private.apply_assistant_task(uuid) from public,anon;
grant execute on function office_private.apply_assistant_task(uuid) to authenticated;
create function public.office_apply_assistant_task(p_id uuid) returns uuid language sql security invoker set search_path='' as $$select office_private.apply_assistant_task(p_id);$$;
revoke all on function public.office_apply_assistant_task(uuid) from public,anon;
grant execute on function public.office_apply_assistant_task(uuid) to authenticated;
