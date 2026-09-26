create or replace function office_private.apply_assistant_task(p_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare task public.office_assistant_tasks%rowtype; r jsonb; kind text; v_name text; email text; v_abn text; client uuid; created uuid; abn_total integer; i integer; weights integer[]=array[10,1,3,5,7,9,11,13,15,17,19];
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Finance admin access required'; end if;
 perform pg_advisory_xact_lock(917264);
 select * into task from public.office_assistant_tasks where id=p_id and user_id=auth.uid() for update;
 if not found or task.status<>'done' then raise exception 'Completed request not found'; end if;
 if task.applied_id is not null then return task.applied_id; end if;
 r=task.response;kind=r->>'action';v_name=trim(r->>'name');email=trim(coalesce(r->>'email',''));v_abn=regexp_replace(coalesce(r->>'abn',''),'\s','','g');
 if v_name is null or length(v_name)<2 or length(v_name)>160 or length(email)>254 or (email<>'' and email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$') then raise exception 'Check the proposed name and email'; end if;
 if kind='create_client' then
  if v_abn<>'' then
   if v_abn !~ '^[0-9]{11}$' then raise exception 'Check the client ABN'; end if;
   abn_total=-10; for i in 1..11 loop abn_total=abn_total+substr(v_abn,i,1)::integer*weights[i]; end loop;
   if abn_total%89<>0 then raise exception 'Check the client ABN'; end if;
  end if;
  if exists(select 1 from public.clients where lower(trim(clients.name))=lower(v_name)) then raise exception 'Client already exists'; end if;
  insert into public.clients(name,billing_email,email,abn,is_active,payment_terms_days) values(v_name,nullif(email,''),nullif(email,''),nullif(v_abn,''),true,14) returning id into created;
 elsif kind='create_site' then
  client=(r->>'clientId')::uuid;
  if not exists(select 1 from public.clients where id=client and is_active) or length(trim(coalesce(r->>'address','')))<2 or length(r->>'address')>240 then raise exception 'Choose an active client and a site address'; end if;
  if exists(select 1 from public.jobs where client_id=client and lower(trim(coalesce(site_name,title)))=lower(v_name)) then raise exception 'Site already exists for this client'; end if;
  insert into public.jobs(client_id,title,site_name,location,status,project_status,created_by) values(client,v_name,v_name,r->>'address','active','active',auth.uid()) returning id into created;
 elsif kind='create_contractor' then
  if exists(select 1 from public.workers w where lower(trim(w.full_name))=lower(v_name) and coalesce(regexp_replace(w.abn,'\s','','g'),'')=v_abn) then raise exception 'This contractor is already registered'; end if;
  if coalesce(r->>'group','') not in ('regular','occasional') or length(coalesce(r->>'phone',''))>40 then raise exception 'Check contractor details'; end if;
  created=public.office_save_contractor(null,v_name,email,coalesce(r->>'phone',''),v_abn,r->>'group',true);
 elsif kind='prepare_client_invoice' then
  created=public.office_prepare_client_draft(task.id,(r->>'clientId')::uuid,(r->>'periodStart')::date,(r->>'periodEnd')::date,r->>'gstMode',(r->>'issueDate')::date,(r->>'dueDate')::date);
 else raise exception 'This request has no supported record to create';
 end if;
 update public.office_assistant_tasks set applied_id=created,applied_at=now() where id=p_id;
 return created;
end;$$;
