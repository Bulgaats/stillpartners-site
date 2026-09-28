create table public.office_contractor_names (
 worker_id uuid primary key references public.workers(id),short_name text not null check(length(trim(short_name)) between 1 and 80),
 aliases text[] not null default '{}' check(cardinality(aliases)<=20),version integer not null check(version>0),updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now()
);
create table public.office_contractor_name_events (
 id uuid primary key,worker_id uuid not null references public.workers(id),actor uuid not null references auth.users(id),request jsonb not null,before_data jsonb,after_data jsonb not null,created_at timestamptz not null default now()
);
create index office_contractor_names_actor on public.office_contractor_names(updated_by);
create index office_contractor_name_events_actor on public.office_contractor_name_events(actor);
create index office_contractor_name_events_worker on public.office_contractor_name_events(worker_id);
alter table public.office_contractor_names enable row level security;
alter table public.office_contractor_name_events enable row level security;
revoke all on public.office_contractor_names,public.office_contractor_name_events from anon,authenticated;
grant select on public.office_contractor_names,public.office_contractor_name_events to authenticated;
create policy contractor_names_finance on public.office_contractor_names for select to authenticated using ((select public.is_admin()));
create policy contractor_name_events_finance on public.office_contractor_name_events for select to authenticated using ((select public.is_admin()));
create function office_private.save_contractor_name(p_event uuid,p_name jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare actor_id uuid=auth.uid();worker uuid=(p_name->>'workerId')::uuid;before_row public.office_contractor_names%rowtype;after_row public.office_contractor_names%rowtype;prior public.office_contractor_name_events%rowtype;names text[];aliases text[];short text=regexp_replace(trim(p_name->>'shortName'),'\s+',' ','g');
begin
 if actor_id is null or not public.is_admin() then raise exception 'Finance admin required';end if;
 if p_event is null or worker is null or p_name->>'expectedVersion' is null or length(short) not between 1 and 80 then raise exception 'Name and version required';end if;
 perform pg_advisory_xact_lock(918030);
 select * into prior from public.office_contractor_name_events where id=p_event;
 if found then if prior.actor<>actor_id or prior.request<>p_name then raise exception 'Request already used for different names';end if;return worker;end if;
 if not exists(select 1 from public.workers where id=worker and full_name=p_name->>'fullName') then raise exception 'Contractor identity changed or could not be matched. Reload before saving';end if;
 select * into before_row from public.office_contractor_names where worker_id=worker for update;
 if coalesce(before_row.version,0)<>(p_name->>'expectedVersion')::integer then raise exception 'Short names changed. Reload before saving';end if;
 select coalesce(array_agg(distinct regexp_replace(trim(value),'\s+',' ','g')),'{}') into aliases from jsonb_array_elements_text(p_name->'aliases');
 if cardinality(aliases)>20 or exists(select 1 from unnest(aliases) a where length(a) not between 1 and 80) then raise exception 'Use up to 20 aliases of 1–80 characters';end if;
 select array_agg(distinct lower(x)) into names from unnest(array_append(aliases,short)) x;
 if exists(select 1 from public.office_contractor_names n cross join lateral unnest(array_append(n.aliases,n.short_name)) v where n.worker_id<>worker and lower(v)=any(names)) or exists(select 1 from public.workers w where w.id<>worker and lower(regexp_replace(trim(w.full_name),'\s+',' ','g'))=any(names)) then raise exception 'This name already identifies another contractor. Use a distinct short name';end if;
 insert into public.office_contractor_names(worker_id,short_name,aliases,version,updated_by) values(worker,short,aliases,1,actor_id)
 on conflict(worker_id) do update set short_name=excluded.short_name,aliases=excluded.aliases,version=office_contractor_names.version+1,updated_by=actor_id,updated_at=now() returning * into after_row;
 insert into public.office_contractor_name_events(id,worker_id,actor,request,before_data,after_data) values(p_event,worker,actor_id,p_name,case when before_row.worker_id is null then null else to_jsonb(before_row) end,to_jsonb(after_row));
 return worker;
end;$$;
revoke all on function office_private.save_contractor_name(uuid,jsonb) from public,anon;
grant execute on function office_private.save_contractor_name(uuid,jsonb) to authenticated;
create function public.office_save_contractor_name(p_event uuid,p_name jsonb) returns uuid language sql security invoker set search_path='' as $$select office_private.save_contractor_name(p_event,p_name);$$;
revoke all on function public.office_save_contractor_name(uuid,jsonb) from public,anon;
grant execute on function public.office_save_contractor_name(uuid,jsonb) to authenticated;
create function office_private.apply_contractor_names(p_task uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare task public.office_assistant_tasks%rowtype;proposal jsonb;idx integer=0;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Finance admin required';end if;
 select * into task from public.office_assistant_tasks where id=p_task and user_id=auth.uid() for update;
 if not found or task.status<>'done' or task.response->>'action'<>'save_contractor_names' then raise exception 'Completed name proposal required';end if;
 if task.applied_id is not null then return task.applied_id;end if;
 if jsonb_typeof(task.response->'contractorNames') is distinct from 'array' or jsonb_array_length(task.response->'contractorNames') not between 1 and 100 then raise exception 'No resolved name proposals';end if;
 for proposal in select value from jsonb_array_elements(task.response->'contractorNames') loop
  perform office_private.save_contractor_name(md5(p_task::text||':name:'||idx)::uuid,proposal);idx=idx+1;
 end loop;
 update public.office_assistant_tasks set applied_id=p_task where id=p_task;
 return p_task;
end;$$;
revoke all on function office_private.apply_contractor_names(uuid) from public,anon;
grant execute on function office_private.apply_contractor_names(uuid) to authenticated;
create function public.office_apply_contractor_names(p_task uuid) returns uuid language sql security invoker set search_path='' as $$select office_private.apply_contractor_names(p_task);$$;
revoke all on function public.office_apply_contractor_names(uuid) from public,anon;
grant execute on function public.office_apply_contractor_names(uuid) to authenticated;

-- Freeze client-facing short names with the work/rate source. Legal names stay internal.
create or replace function office_private.client_draft_source(p_client uuid,p_from date,p_to date) returns jsonb language plpgsql security definer set search_path='' as $$
declare company public.clients%rowtype; rows jsonb; r record; line jsonb; n integer:=0;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Finance admin access required';end if;
 if p_from is null or p_to is null or p_from>p_to or p_to-p_from>61 or p_from<'2000-01-01'::date or p_to>(now() at time zone 'Australia/Perth')::date then raise exception 'Choose a completed work period of up to 62 days';end if;
 select * into company from public.clients where id=p_client and is_active;
 if not found then raise exception 'Choose an active client';end if;
 -- Serialize work edits before reading adjustments and rate snapshots.
 perform e.id from public.work_entries e join public.jobs j on j.id=e.job_id where j.client_id=p_client and e.work_date between p_from and p_to order by e.id for update of e;
 rows='[]'::jsonb;
 for r in select e.id,e.worker_id,e.work_date,e.hours,e.updated_at,e.locked,e.approved,j.id as site_id,coalesce(j.site_name,j.title) as site_name,w.full_name,n.short_name,
 coalesce(a.client_hours,e.hours) as client_hours,coalesce(a.contractor_hours,e.hours) as contractor_hours,coalesce(a.agreement_note,'Same as actual hours') as agreement_note,
 rate.id as rate_id,rate.hourly_rate_cents
 from public.work_entries e join public.jobs j on j.id=e.job_id join public.workers w on w.id=e.worker_id
 left join public.office_contractor_names n on n.worker_id=w.id
 left join public.office_work_adjustments a on a.work_entry_id=e.id
 left join lateral (select v.id,v.hourly_rate_cents from public.office_rates v where v.worker_id=e.worker_id and v.client_id=p_client and v.kind='client' and v.voided_at is null and v.effective_from<=e.work_date order by v.effective_from desc limit 1) rate on true
 where j.client_id=p_client and e.work_date between p_from and p_to order by e.work_date,j.id,w.full_name,n.short_name,e.id loop
  if r.locked or r.approved or exists(select 1 from office_private.client_allocations ca where ca.entry_id=r.id and ca.released_at is null) then raise exception 'This period contains locked or already invoiced work. Review the dates and existing invoices.';end if;
  if r.hours<0 or r.hours>24 or r.client_hours<0 or r.client_hours>24 or r.hours<>round(r.hours,2) or r.client_hours<>round(r.client_hours,2) then raise exception 'Review invalid work hours before preparing an invoice';end if;
  if r.client_hours>0 and r.rate_id is null then raise exception 'Missing agreed client rate for % on %. Add the rate with its correct effective date.',r.full_name,r.work_date;end if;
  if coalesce(trim(r.short_name),'')='' then raise exception 'Add a short name for % in Company → Contractors before preparing the client summary.',r.full_name;end if;
  line=jsonb_build_object('entryId',r.id,'workerId',r.worker_id,'fullName',r.full_name,'summaryName',r.short_name,'workDate',r.work_date,'siteId',r.site_id,'siteName',r.site_name,'actualHours',r.hours,'contractorHours',r.contractor_hours,'clientHours',r.client_hours,'agreementNote',r.agreement_note,'updatedAt',r.updated_at,'rateId',r.rate_id,'rateCents',r.hourly_rate_cents,'amountCents',round(r.client_hours*coalesce(r.hourly_rate_cents,0))::bigint);
  rows=rows||jsonb_build_array(line);n=n+1;if n>2000 then raise exception 'Choose a shorter invoice period';end if;
 end loop;
 if n=0 then raise exception 'No work records found for this client and period';end if;
 return jsonb_build_object('clientId',company.id,'clientName',company.name,'clientAbn',coalesce(company.abn,''),'clientEmail',coalesce(company.billing_email,company.email,''),'rows',rows);
end;$$;
