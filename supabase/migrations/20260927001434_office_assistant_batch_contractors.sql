create table public.office_assistant_applications(
 task_id uuid not null references public.office_assistant_tasks(id) on delete restrict,
 proposal_index integer not null check(proposal_index between 0 and 99),
 user_id uuid not null references auth.users(id),
 worker_id uuid references public.workers(id),
 status text not null check(status in ('created','existing','review')),
 message text not null,
 updated_at timestamptz not null default now(),
 primary key(task_id,proposal_index),
 check((status='review' and worker_id is null) or (status in ('created','existing') and worker_id is not null))
);
alter table public.office_assistant_applications enable row level security;
revoke all on public.office_assistant_applications from public,anon,authenticated;
grant select on public.office_assistant_applications to authenticated;
create policy assistant_application_read on public.office_assistant_applications for select to authenticated
 using((select public.is_admin()) and user_id=(select auth.uid()));
create index assistant_applications_owner on public.office_assistant_applications(user_id);
create index assistant_applications_worker on public.office_assistant_applications(worker_id);

create function office_private.apply_assistant_contractors(p_id uuid,p_indices integer[] default null) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare task public.office_assistant_tasks%rowtype; candidate jsonb; saved public.office_assistant_applications%rowtype;
 idx integer; n integer; v_name text; v_abn text; v_email text; v_phone text; v_group text; result_id uuid;
 v_status text; v_message text; norm_name text; current_worker public.workers%rowtype; source_docs jsonb; source_id text; source_doc jsonb;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Finance admin access required'; end if;
 perform pg_advisory_xact_lock(917264);
 select * into task from public.office_assistant_tasks where id=p_id and user_id=auth.uid() for update;
 if not found or task.status<>'done' or task.response->>'action'<>'create_contractors' then raise exception 'Completed contractor batch not found'; end if;
 if jsonb_typeof(task.response->'contractors') is distinct from 'array' then raise exception 'Contractor proposals are missing'; end if;
 n=jsonb_array_length(task.response->'contractors');
 if n<1 or n>100 then raise exception 'Invalid contractor batch'; end if;
 if p_indices is not null and (cardinality(p_indices)<1 or cardinality(p_indices)>100 or exists(select 1 from unnest(p_indices) i where i is null or i<0 or i>=n)) then raise exception 'Invalid proposal selection'; end if;
 select payload->'documents' into source_docs from public.office_invoice_snapshots order by exported_at desc limit 1;
 for idx in 0..n-1 loop
  if p_indices is not null and not idx=any(p_indices) then continue; end if;
  select * into saved from public.office_assistant_applications where task_id=p_id and proposal_index=idx;
  if found and saved.status in ('created','existing') then continue; end if;
  candidate=task.response->'contractors'->idx; result_id=null;v_status='review';v_message='';
  begin
   v_name=btrim(coalesce(candidate->>'name',''));v_abn=regexp_replace(coalesce(candidate->>'abn',''),'[[:space:]]','','g');
   v_email=btrim(coalesce(candidate->>'email',''));v_phone=btrim(coalesce(candidate->>'phone',''));v_group=candidate->>'group';
   norm_name=lower(regexp_replace(v_name,'[[:space:]]+',' ','g'));
   if length(v_name) not between 2 and 160 or length(v_email)>254 or length(v_phone)>40 or coalesce(v_group,'') not in ('regular','occasional') then raise exception 'Check the proposed contact details'; end if;
   if v_email<>'' and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Check the proposed email'; end if;
   if v_abn='62687072420' then raise exception 'Buyer ABN cannot identify a contractor'; end if;
   if jsonb_typeof(candidate->'sourceDocumentIds') is distinct from 'array' or jsonb_array_length(candidate->'sourceDocumentIds')>20 then raise exception 'Check the source invoice references'; end if;
   for source_id in select jsonb_array_elements_text(candidate->'sourceDocumentIds') loop
    select d into source_doc from jsonb_array_elements(coalesce(source_docs,'[]'::jsonb)) d where d->>'id'=source_id limit 1;
    if source_doc is null or source_doc->>'recordType' is distinct from 'invoice'
      or lower(regexp_replace(btrim(coalesce(source_doc->>'name','')),'[[:space:]]+',' ','g'))<>norm_name
      or regexp_replace(coalesce(source_doc->>'abn',''),'[[:space:]]','','g')<>v_abn then
     raise exception 'Invoice supplier identity does not match this proposal. Review the source';
    end if;
   end loop;
   select * into current_worker from public.workers w
    where lower(regexp_replace(btrim(w.full_name),'[[:space:]]+',' ','g'))=norm_name
     and regexp_replace(coalesce(w.abn,''),'[[:space:]]','','g')=v_abn limit 1;
   if found then
    if (v_email<>'' and coalesce(current_worker.email,'')<>'' and lower(v_email)<>lower(current_worker.email))
     or (v_phone<>'' and coalesce(current_worker.phone,'')<>'' and regexp_replace(v_phone,'[^0-9]','','g')<>regexp_replace(current_worker.phone,'[^0-9]','','g')) then
     raise exception 'Existing contractor has different contact details. Review before changing';
    end if;
    result_id=current_worker.id;v_status='existing';v_message='Already in the directory. Existing details kept.';
   else
    if exists(select 1 from public.workers w where lower(regexp_replace(btrim(w.full_name),'[[:space:]]+',' ','g'))=norm_name
      or (v_abn<>'' and regexp_replace(coalesce(w.abn,''),'[[:space:]]','','g')=v_abn)
      or (v_email<>'' and lower(coalesce(w.email,''))=lower(v_email))
      or (v_phone<>'' and regexp_replace(coalesce(w.phone,''),'[^0-9]','','g')=regexp_replace(v_phone,'[^0-9]','','g'))) then
     raise exception 'Name, ABN or contact detail overlaps an existing contractor. Review identity';
    end if;
    result_id=public.office_save_contractor(null,v_name,v_email,v_phone,v_abn,v_group,true);
    v_status='created';v_message='Contractor created.';
   end if;
  exception when sqlstate 'P0001' then
   result_id=null;v_status='review';v_message=sqlerrm;
  when others then
   result_id=null;v_status='review';v_message='Could not save this proposal. Review details and retry.';
  end;
  insert into public.office_assistant_applications(task_id,proposal_index,user_id,worker_id,status,message)
   values(p_id,idx,auth.uid(),result_id,v_status,v_message)
   on conflict(task_id,proposal_index) do update set worker_id=excluded.worker_id,status=excluded.status,message=excluded.message,updated_at=now();
 end loop;
 return (select coalesce(jsonb_agg(jsonb_build_object('proposal_index',proposal_index,'worker_id',worker_id,'status',status,'message',message) order by proposal_index),'[]'::jsonb) from public.office_assistant_applications where task_id=p_id);
end;$$;
revoke all on function office_private.apply_assistant_contractors(uuid,integer[]) from public,anon;
grant execute on function office_private.apply_assistant_contractors(uuid,integer[]) to authenticated;
create function public.office_apply_assistant_contractors(p_id uuid,p_indices integer[] default null) returns jsonb
 language sql security invoker set search_path='' as $$select office_private.apply_assistant_contractors(p_id,p_indices);$$;
revoke all on function public.office_apply_assistant_contractors(uuid,integer[]) from public,anon;
grant execute on function public.office_apply_assistant_contractors(uuid,integer[]) to authenticated;

CREATE OR REPLACE FUNCTION office_private.assistant_exchange(p_token text, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if coalesce(p_request->>'status','') not in ('done','error') or jsonb_typeof(p_request->'response') is distinct from 'object' or pg_column_size(p_request->'response')>180000 then raise exception 'Invalid assistant result'; end if;
  update public.office_assistant_tasks set status=p_request->>'status',response=p_request->'response',finished_at=now() where id=(p_request->>'id')::uuid and lease_id=(p_request->>'lease_id')::uuid and status='running' and user_id=device.owner_id;
  return jsonb_build_object('ok',found);
 end if;
 raise exception 'Unsupported assistant action';
end;$function$
