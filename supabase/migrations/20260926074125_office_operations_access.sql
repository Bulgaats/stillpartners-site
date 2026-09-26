-- Narrow location lookup for internal operations without exposing financial columns.
create function private.office_locations()
returns table(id uuid,client_id uuid,client_name text,client_active boolean,site_name text,project_active boolean)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.can_access_operations() then raise exception 'Operations access required'; end if;
  return query select j.id,c.id,c.name,c.is_active,coalesce(j.site_name,j.title,'Location'),
    coalesce(j.project_status,j.status) in ('planned','active','in_progress')
    from public.jobs j join public.clients c on c.id=j.client_id;
end $$;
revoke all on function private.office_locations() from public,anon,authenticated;
grant execute on function private.office_locations() to authenticated;
create function public.office_locations()
returns table(id uuid,client_id uuid,client_name text,client_active boolean,site_name text,project_active boolean)
language sql stable security invoker set search_path='' as $$ select * from private.office_locations() $$;
revoke all on function public.office_locations() from public,anon;
grant execute on function public.office_locations() to authenticated;

create or replace function public.office_save_work_record(
  p_worker uuid,p_job uuid,p_date date,p_hours numeric,p_expected_updated_at timestamptz default null,
  p_contractor_hours numeric default null,p_client_hours numeric default null,p_note text default null
) returns uuid language plpgsql security invoker set search_path='' as $$
declare existing public.work_entries%rowtype; entry_id uuid; finance boolean; adjustment public.office_work_adjustments%rowtype;
begin
  if auth.uid() is null or not public.can_access_operations() then raise exception 'Operations access required'; end if;
  finance:=public.is_admin();
  if p_date is null or p_date < date '2000-01-01' or p_date > (now() at time zone 'Australia/Perth')::date then raise exception 'Enter an actual work date, not a future date'; end if;
  if p_hours is null or p_hours<0 or p_hours>24 or p_hours<>round(p_hours,2) then raise exception 'Actual hours must be between 0 and 24, with up to two decimals'; end if;
  if not exists(select 1 from private.office_roster() w where w.id=p_worker and w.is_active and w.account_enabled) then raise exception 'Select an active contractor'; end if;
  if not exists(select 1 from private.office_locations() j where j.id=p_job and j.client_active and j.project_active) then raise exception 'Select an active client location'; end if;
  if not finance and (p_contractor_hours is not null or p_client_hours is not null or p_note is not null) then raise exception 'Finance access required for agreed hours'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_worker::text||p_date::text,0));
  if p_hours+(select coalesce(sum(hours),0) from public.work_entries where worker_id=p_worker and work_date=p_date and job_id<>p_job)>24 then raise exception 'Actual hours across all locations exceed 24 for this contractor and date'; end if;
  select * into existing from public.work_entries where worker_id=p_worker and job_id=p_job and work_date=p_date for update;
  if found then
    if existing.locked or existing.approved then raise exception 'This work record is locked or already invoiced'; end if;
    if p_expected_updated_at is null or existing.updated_at is distinct from p_expected_updated_at then raise exception 'Record changed. Reload before saving'; end if;
    entry_id:=existing.id;
    update public.work_entries set hours=p_hours,entered_by=auth.uid(),entry_role=case when finance then existing.entry_role else 'operations_admin' end,updated_at=clock_timestamp() where id=entry_id;
  else
    if p_expected_updated_at is not null then raise exception 'Record changed. Reload before saving'; end if;
    insert into public.work_entries(worker_id,job_id,work_date,hours,entered_by,entry_role,approved,locked)
      values(p_worker,p_job,p_date,p_hours,auth.uid(),case when finance then 'admin' else 'operations_admin' end,false,false) returning id into entry_id;
  end if;
  if finance then
    if p_contractor_hours is null or p_client_hours is null or p_contractor_hours<0 or p_contractor_hours>24 or p_client_hours<0 or p_client_hours>24
      or p_contractor_hours<>round(p_contractor_hours,2) or p_client_hours<>round(p_client_hours,2) then raise exception 'Enter the agreed contractor and client hours'; end if;
    if (p_contractor_hours<>p_hours or p_client_hours<>p_hours) and length(btrim(coalesce(p_note,'')))<3 then raise exception 'Explain the agreement when payable or billable hours differ from actual hours'; end if;
    insert into public.office_work_adjustments(work_entry_id,contractor_hours,client_hours,agreement_note,updated_by)
      values(entry_id,p_contractor_hours,p_client_hours,coalesce(nullif(btrim(p_note),''),'Same as actual hours'),auth.uid())
      on conflict(work_entry_id) do update set contractor_hours=excluded.contractor_hours,client_hours=excluded.client_hours,
        agreement_note=excluded.agreement_note,updated_by=auth.uid(),updated_at=clock_timestamp();
  end if;
  insert into public.audit_logs(actor_id,entity_table,entity_id,action,metadata)
    values(auth.uid(),'work_entries',entry_id,'office.work_record_saved',jsonb_build_object('previous_hours',existing.hours,'actual_hours',p_hours,'work_date',p_date));
  return entry_id;
end $$;
revoke all on function public.office_save_work_record(uuid,uuid,date,numeric,timestamptz,numeric,numeric,text) from public,anon;
grant execute on function public.office_save_work_record(uuid,uuid,date,numeric,timestamptz,numeric,numeric,text) to authenticated;
