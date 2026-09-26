-- Additive office foundation. Existing invoices, hours and legacy rates remain intact.
-- User-entered office rates are independent of the old spreadsheet/tonne rates.
revoke update on public.profiles from authenticated, anon;
grant update (full_name, agreement_version) on public.profiles to authenticated;

create table public.office_contractor_settings (
  worker_id uuid primary key references public.workers(id) on delete restrict,
  engagement_group text not null default 'regular' check (engagement_group in ('regular','occasional')),
  updated_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid() references auth.users(id)
);
create table public.office_rates (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete restrict,
  client_id uuid references public.clients(id) on delete restrict,
  kind text not null check (kind in ('contractor','client')),
  hourly_rate_cents integer not null check (hourly_rate_cents between 1 and 10000000),
  effective_from date not null check (effective_from >= date '2000-01-01'),
  agreement_note text not null check (length(btrim(agreement_note)) between 3 and 2000),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  voided_at timestamptz,
  void_reason text,
  check (kind <> 'client' or client_id is not null),
  check ((voided_at is null and void_reason is null) or (voided_at is not null and length(btrim(void_reason)) >= 3))
);
create unique index office_rates_one_base_date on public.office_rates(worker_id,kind,effective_from)
  where client_id is null and voided_at is null;
create unique index office_rates_one_client_date on public.office_rates(worker_id,client_id,kind,effective_from)
  where client_id is not null and voided_at is null;
create index office_rates_client on public.office_rates(client_id) where client_id is not null;
create index office_rates_created_by on public.office_rates(created_by);
create table public.office_work_adjustments (
  work_entry_id uuid primary key references public.work_entries(id) on delete restrict,
  contractor_hours numeric(6,2) not null check (contractor_hours between 0 and 24),
  client_hours numeric(6,2) not null check (client_hours between 0 and 24),
  agreement_note text not null check (length(btrim(agreement_note)) between 3 and 2000),
  updated_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid() references auth.users(id)
);
create index office_contractor_settings_updated_by on public.office_contractor_settings(updated_by);
create index office_work_adjustments_updated_by on public.office_work_adjustments(updated_by);
alter table public.office_contractor_settings enable row level security;
alter table public.office_rates enable row level security;
alter table public.office_work_adjustments enable row level security;
revoke all on public.office_contractor_settings,public.office_rates,public.office_work_adjustments from anon,authenticated;
grant select,insert,update on public.office_contractor_settings,public.office_rates,public.office_work_adjustments to authenticated;
grant all on public.office_contractor_settings,public.office_rates,public.office_work_adjustments to service_role;
create policy "Office admin settings" on public.office_contractor_settings for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Office admin rates" on public.office_rates for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Office admin adjustments" on public.office_work_adjustments for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create or replace function public.office_audit_change() returns trigger
language plpgsql security invoker set search_path='' as $$
declare before_row jsonb; after_row jsonb; entity uuid;
begin
  if tg_op='UPDATE' then before_row:=to_jsonb(old); end if;
  after_row:=to_jsonb(new);
  if tg_table_name='office_rates' and tg_op='UPDATE' then
    if (after_row - 'voided_at' - 'void_reason') is distinct from (before_row - 'voided_at' - 'void_reason')
       or old.voided_at is not null or new.voided_at is null then
      raise exception 'Rate history is immutable. Void the incorrect rate with a reason and add a new rate.';
    end if;
  end if;
  entity:=coalesce((after_row->>'id')::uuid,(after_row->>'worker_id')::uuid,(after_row->>'work_entry_id')::uuid);
  insert into public.audit_logs(actor_id,entity_table,entity_id,action,metadata)
    values(auth.uid(),tg_table_name,entity,'office.'||lower(tg_op),jsonb_build_object('before',before_row,'after',after_row));
  return new;
end $$;
revoke all on function public.office_audit_change() from public,anon,authenticated;
create trigger office_settings_audit after insert or update on public.office_contractor_settings
  for each row execute function public.office_audit_change();
create trigger office_rates_audit after insert or update on public.office_rates
  for each row execute function public.office_audit_change();
create trigger office_adjustments_audit after insert or update on public.office_work_adjustments
  for each row execute function public.office_audit_change();

create schema if not exists private;
create function private.office_roster() returns table(id uuid,full_name text,is_active boolean,account_enabled boolean)
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.can_access_operations() then raise exception 'Operations access required'; end if;
  return query select w.id,w.full_name,w.is_active,w.account_enabled from public.workers w;
end $$;
revoke all on function private.office_roster() from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.office_roster() to authenticated;
create function public.office_roster() returns table(id uuid,full_name text,is_active boolean,account_enabled boolean)
language sql security invoker set search_path='' as $$ select * from private.office_roster() $$;
revoke all on function public.office_roster() from public,anon;
grant execute on function public.office_roster() to authenticated;

create function public.office_save_work_record(
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
  if not exists(select 1 from public.jobs j where j.id=p_job and j.client_id is not null and coalesce(j.project_status,j.status) in ('planned','active','in_progress')) then raise exception 'Select an active client location'; end if;
  if not finance and (p_contractor_hours is not null or p_client_hours is not null or p_note is not null) then raise exception 'Finance access required for agreed hours'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_worker::text||p_date::text,0));
  if p_hours+(select coalesce(sum(hours),0) from public.work_entries where worker_id=p_worker and work_date=p_date and job_id<>p_job)>24 then raise exception 'Actual hours across all locations exceed 24 for this contractor and date'; end if;
  select * into existing from public.work_entries where worker_id=p_worker and job_id=p_job and work_date=p_date for update;
  if found then
    if existing.locked or existing.approved then raise exception 'This work record is locked or already invoiced'; end if;
    if p_expected_updated_at is null or existing.updated_at is distinct from p_expected_updated_at then raise exception 'Record changed. Reload before saving'; end if;
    entry_id:=existing.id;
    update public.work_entries set hours=p_hours,entered_by=auth.uid(),updated_at=clock_timestamp() where id=entry_id;
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

create function public.office_save_contractor(p_id uuid,p_name text,p_email text,p_phone text,p_abn text,p_group text,p_active boolean)
returns uuid language plpgsql security invoker set search_path='' as $$
declare result_id uuid; before_row jsonb; checksum integer:=0; digit integer; weights integer[]:=array[10,1,3,5,7,9,11,13,15,17,19];
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Finance admin access required'; end if;
  if length(btrim(p_name)) not between 2 and 160 or p_group not in ('regular','occasional') or p_active is null then raise exception 'Check contractor details'; end if;
  p_abn:=regexp_replace(coalesce(p_abn,''),'\s','','g');
  if p_abn<>'' then
    if p_abn !~ '^[0-9]{11}$' or p_abn='62687072420' then raise exception 'Enter a supplier ABN, not the buyer ABN'; end if;
    for i in 1..11 loop digit:=substring(p_abn,i,1)::integer; if i=1 then digit:=digit-1; end if; checksum:=checksum+digit*weights[i]; end loop;
    if checksum%89<>0 then raise exception 'Supplier ABN checksum is invalid'; end if;
  end if;
  if p_id is null then
    if nullif(p_abn,'') is not null and exists(select 1 from public.workers where abn=p_abn and lower(full_name)=lower(btrim(p_name))) then raise exception 'This name and ABN are already registered. Edit the existing contact.'; end if;
    insert into public.workers(full_name,email,phone,abn,is_active,account_enabled)
      values(btrim(p_name),nullif(btrim(p_email),''),nullif(btrim(p_phone),''),nullif(p_abn,''),p_active,true) returning id into result_id;
  else
    select jsonb_build_object('full_name',full_name,'email',email,'phone',phone,'abn',abn,'is_active',is_active)
      into before_row from public.workers where id=p_id for update;
    if not found then raise exception 'Contractor not found'; end if;
    update public.workers set full_name=btrim(p_name),email=nullif(btrim(p_email),''),phone=nullif(btrim(p_phone),''),abn=nullif(p_abn,''),is_active=p_active where id=p_id;
    result_id:=p_id;
  end if;
  insert into public.office_contractor_settings(worker_id,engagement_group,updated_by)
    values(result_id,p_group,auth.uid()) on conflict(worker_id) do update
      set engagement_group=excluded.engagement_group,updated_at=clock_timestamp(),updated_by=auth.uid();
  insert into public.audit_logs(actor_id,entity_table,entity_id,action,metadata)
    values(auth.uid(),'workers',result_id,'office.contact_saved',jsonb_build_object('before',before_row,'full_name',p_name,'email',p_email,'phone',p_phone,'abn',p_abn,'group',p_group,'active',p_active));
  return result_id;
end $$;
revoke all on function public.office_save_contractor(uuid,text,text,text,text,text,boolean) from public,anon;
grant execute on function public.office_save_contractor(uuid,text,text,text,text,text,boolean) to authenticated;
