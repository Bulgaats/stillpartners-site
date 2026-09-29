-- Owner-entered plans are expectations only, never work or payment evidence.
create table public.office_site_plans (
 id uuid primary key default gen_random_uuid(), job_id uuid not null references public.jobs(id),
 work_date date not null, reminder_time time not null default '17:00', note text not null default '' check(length(note)<=1000),
 version integer not null default 1, created_by uuid not null references public.profiles(id), updated_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(job_id,work_date)
);
create table public.office_site_plan_people (
 plan_id uuid not null references public.office_site_plans(id), worker_id uuid not null references public.workers(id),
 active boolean not null default true, primary key(plan_id,worker_id)
);
create index office_site_plan_people_worker on public.office_site_plan_people(worker_id);
create index office_site_plans_day on public.office_site_plans(work_date);
create index office_site_plans_created_by on public.office_site_plans(created_by);
create index office_site_plans_updated_by on public.office_site_plans(updated_by);
create table public.office_site_plan_events (
 id uuid primary key,plan_id uuid not null references public.office_site_plans(id),actor_id uuid not null references public.profiles(id),
 request jsonb not null,before_data jsonb,after_data jsonb not null,created_at timestamptz not null default now()
);
create index office_site_plan_events_plan on public.office_site_plan_events(plan_id);
create index office_site_plan_events_actor on public.office_site_plan_events(actor_id);
alter table public.office_site_plans enable row level security;
alter table public.office_site_plan_people enable row level security;
alter table public.office_site_plan_events enable row level security;
revoke all on public.office_site_plans,public.office_site_plan_people,public.office_site_plan_events from public,anon,authenticated;
grant select on public.office_site_plans,public.office_site_plan_people,public.office_site_plan_events to authenticated;
grant all on public.office_site_plans,public.office_site_plan_people,public.office_site_plan_events to service_role;
create policy "Operational plans read" on public.office_site_plans for select to authenticated using (exists(select 1 from public.profiles where id=(select auth.uid()) and role::text in ('admin','operations_admin') and coalesce(is_active,true)));
create policy "Operational plan people read" on public.office_site_plan_people for select to authenticated using (exists(select 1 from public.profiles where id=(select auth.uid()) and role::text in ('admin','operations_admin') and coalesce(is_active,true)));
create policy "Operational plan history read" on public.office_site_plan_events for select to authenticated using (exists(select 1 from public.profiles where id=(select auth.uid()) and role::text in ('admin','operations_admin') and coalesce(is_active,true)));

create function office_private.plan_evidence(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',p.id,'jobId',p.job_id,'workDate',p.work_date,'reminderTime',to_char(p.reminder_time,'HH24:MI'),
 'version',p.version,'note',p.note,'site',j.site_name,'address',coalesce(j.location,''),'client',c.name,
 'people',coalesce(a.people,'[]'::jsonb),'missing',coalesce(a.missing,0),
 'due',p.work_date+p.reminder_time <= (now() at time zone 'Australia/Perth') and coalesce(a.missing,0)>0)
 from public.office_site_plans p join public.jobs j on j.id=p.job_id left join public.clients c on c.id=j.client_id
 left join lateral (
 select jsonb_agg(jsonb_build_object('id',w.id,'fullName',w.full_name,'shortName',coalesce(n.short_name,''),'active',pp.active,
 'entryId',e.id,'hours',e.hours,'otherSites',(select coalesce(jsonb_agg(j2.site_name order by j2.site_name),'[]'::jsonb) from public.work_entries e2 join public.jobs j2 on j2.id=e2.job_id where e2.worker_id=w.id and e2.work_date=p.work_date and e2.job_id<>p.job_id)) order by w.full_name,w.id) people,
 count(*) filter(where pp.active and e.id is null) missing
 from public.office_site_plan_people pp join public.workers w on w.id=pp.worker_id
 left join public.office_contractor_names n on n.worker_id=w.id
 left join public.work_entries e on e.worker_id=w.id and e.job_id=p.job_id and e.work_date=p.work_date
 where pp.plan_id=p.id
 ) a on true where p.id=p_id;
$$;
revoke all on function office_private.plan_evidence(uuid) from public,anon,authenticated;

create table office_private.site_plan_monitor (
 singleton boolean primary key default true check(singleton), last_scan timestamptz, last_error text
);
insert into office_private.site_plan_monitor(singleton) values(true);
alter table office_private.site_plan_monitor enable row level security;
revoke all on office_private.site_plan_monitor from public,anon,authenticated;

create function office_private.scan_site_plans() returns void language plpgsql security definer set search_path='' as $$
declare actor uuid; x record; e jsonb;names text;active_keys text[]='{}'; key text;
begin
 -- Background execution has no browser JWT; browser calls require a current operational admin.
 if auth.uid() is not null and not exists(select 1 from public.profiles where id=auth.uid() and role::text in ('admin','operations_admin') and coalesce(is_active,true)) then raise exception 'Operations access required';end if;
 if not pg_try_advisory_xact_lock(917292) then return;end if;
 if not coalesce((select enabled from office_private.monitor_state where singleton),false) then return;end if;
 select id into actor from public.profiles where role::text='admin' and coalesce(is_active,true) order by created_at,id limit 1;
 if actor is null then return;end if;
 for x in select id from public.office_site_plans where work_date<=(now() at time zone 'Australia/Perth')::date loop
  e=office_private.plan_evidence(x.id);
  if (e->>'due')::boolean then
   key='planned-work:'||x.id;active_keys=array_append(active_keys,key);
   select string_agg(coalesce(nullif(v->>'shortName',''),v->>'fullName'),', ' order by v->>'fullName') into names from jsonb_array_elements(e->'people') v where (v->>'active')::boolean and v->>'entryId' is null;
   -- Digest only missing expectations; incidental paid/billable edits do not re-alert.
   perform office_private.detect_work(actor,key,'missing_work','Hours needed · '||(e->>'workDate')||' · '||(e->>'site'),
    'How many hours did '||names||' work at '||(e->>'site')||' on '||(e->>'workDate')||'? Planned participation is not proof of work.',
    'Open Sites → Site plans for this date. Record actual hours, or remove someone who did not attend. A record at another site does not silently satisfy this plan.',
    '/office?view=plans&date='||(e->>'workDate'),jsonb_build_object('planId',x.id,'workDate',e->>'workDate','jobId',e->>'jobId','missingPeople',(select jsonb_agg(v->>'id' order by v->>'id') from jsonb_array_elements(e->'people') v where (v->>'active')::boolean and v->>'entryId' is null)));
  end if;
 end loop;
 for x in select l.issue_key,r.title from office_private.detected_work l join public.office_company_records r on r.id=l.record_id where l.rule='missing_work' and l.active and not(l.issue_key=any(active_keys)) loop
  perform office_private.detect_work(actor,x.issue_key,'missing_work',x.title,'Expected hours are now recorded, participation was removed, or the reminder time has not yet arrived.','','',jsonb_build_object('cleared',true),false);
 end loop;
 update office_private.site_plan_monitor set last_scan=now(),last_error=null where singleton;
end;$$;
revoke all on function office_private.scan_site_plans() from public,anon,authenticated;

create function office_private.read_site_plans(p_from date,p_to date,p_due_only boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare plans jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role::text in ('admin','operations_admin') and coalesce(is_active,true)) then raise exception 'Operations access required';end if;
 if not p_due_only and (p_from is null or p_to is null or p_to<p_from or p_to-p_from>366) then raise exception 'Select a date range of up to one year';end if;
 select coalesce(jsonb_agg(v order by v->>'workDate',v->>'site'),'[]'::jsonb) into plans from (
  select office_private.plan_evidence(id) v from public.office_site_plans where
   (p_due_only and work_date<=(now() at time zone 'Australia/Perth')::date) or (not p_due_only and work_date between p_from and p_to)
 ) p where not p_due_only or ((v->>'due')::boolean and not exists(select 1 from office_private.detected_work l join public.office_company_records r on r.id=l.record_id where l.issue_key='planned-work:'||(v->>'id') and l.active and r.status in ('completed','cancelled')));
 return jsonb_build_object('plans',plans,'enabled',(select enabled from office_private.monitor_state where singleton),'checkedAt',now(),
 'lastScan',(select last_scan from office_private.site_plan_monitor where singleton),'scanError',(select last_error from office_private.site_plan_monitor where singleton));
end;$$;
revoke all on function office_private.read_site_plans(date,date,boolean) from public,anon;
grant execute on function office_private.read_site_plans(date,date,boolean) to authenticated;
create function public.office_read_site_plans(p_from date default null,p_to date default null,p_due_only boolean default false) returns jsonb language sql security invoker set search_path='' as $$ select office_private.read_site_plans(p_from,p_to,p_due_only); $$;
revoke all on function public.office_read_site_plans(date,date,boolean) from public,anon;
grant execute on function public.office_read_site_plans(date,date,boolean) to authenticated;

create function office_private.save_site_plan(p_event uuid,p_plan jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid=auth.uid();p public.office_site_plans%rowtype;prior public.office_site_plan_events%rowtype;before_value jsonb;after_value jsonb;
 job uuid=(p_plan->>'jobId')::uuid;day date=(p_plan->>'workDate')::date;ids uuid[];t time;w uuid;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor and role::text in ('admin','operations_admin') and coalesce(is_active,true)) then raise exception 'Operations access required';end if;
 if p_event is null or p_plan is null or day is null or day<date '2026-09-29' or day>(now() at time zone 'Australia/Perth')::date+366 then raise exception 'Select a planning date from 29 September 2026, up to one year ahead';end if;
 if coalesce(p_plan->>'reminderTime','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or length(coalesce(p_plan->>'note',''))>1000 or jsonb_typeof(p_plan->'workerIds') is distinct from 'array' then raise exception 'Invalid plan';end if;
 t=(p_plan->>'reminderTime')::time;
 select coalesce(array_agg(value::uuid),'{}') into ids from jsonb_array_elements_text(p_plan->'workerIds');
 if cardinality(ids)>100 or cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then raise exception 'Select each contractor once (maximum 100)';end if;
 -- Stable global save lock: small office plans, serialised conflicts/retries across devices.
 perform pg_advisory_xact_lock(917291);
 select * into prior from public.office_site_plan_events where id=p_event;
 if found then
  if prior.actor_id<>actor or prior.request<>p_plan then raise exception 'Request ID already used for different changes';end if;
  return prior.after_data;
 end if;
 select * into p from public.office_site_plans where job_id=job and work_date=day for update;
 if coalesce(p.version,0) is distinct from (p_plan->>'expectedVersion')::integer then raise exception 'Plan changed on another device. Reload before saving';end if;
 if not exists(select 1 from public.jobs j join public.clients c on c.id=j.client_id where j.id=job and c.is_active and coalesce(j.project_status,j.status) in ('planned','active','in_progress')) and (p.id is null or cardinality(ids)>0) then raise exception 'Select an active client site';end if;
 foreach w in array ids loop
  if not exists(select 1 from public.workers where id=w and is_active and account_enabled) and not exists(select 1 from public.office_site_plan_people where plan_id=p.id and worker_id=w and active) then raise exception 'Select active contractors';end if;
  if exists(select 1 from public.office_site_plan_people pp join public.office_site_plans sp on sp.id=pp.plan_id where pp.worker_id=w and pp.active and sp.work_date=day and sp.job_id<>job) then raise exception 'Someone is already planned at another site that day. Remove that participation first before moving them';end if;
 end loop;
 if p.id is not null then before_value=office_private.plan_evidence(p.id);end if;
 if p.id is null then insert into public.office_site_plans(job_id,work_date,reminder_time,note,created_by,updated_by) values(job,day,t,coalesce(p_plan->>'note',''),actor,actor) returning * into p;
 else update public.office_site_plans set reminder_time=t,note=coalesce(p_plan->>'note',''),version=version+1,updated_by=actor,updated_at=clock_timestamp() where id=p.id returning * into p;end if;
 update public.office_site_plan_people set active=false where plan_id=p.id and not(worker_id=any(ids));
 insert into public.office_site_plan_people(plan_id,worker_id,active) select p.id,x,true from unnest(ids) x on conflict(plan_id,worker_id) do update set active=true;
 after_value=office_private.plan_evidence(p.id);
 insert into public.office_site_plan_events(id,plan_id,actor_id,request,before_data,after_data) values(p_event,p.id,actor,p_plan,before_value,after_value);
 perform office_private.scan_site_plans();
 return after_value;
end;$$;
revoke all on function office_private.save_site_plan(uuid,jsonb) from public,anon;
grant execute on function office_private.save_site_plan(uuid,jsonb) to authenticated;
create function public.office_save_site_plan(p_event uuid,p_plan jsonb) returns jsonb language sql security invoker set search_path='' as $$select office_private.save_site_plan(p_event,p_plan);$$;
revoke all on function public.office_save_site_plan(uuid,jsonb) from public,anon;
grant execute on function public.office_save_site_plan(uuid,jsonb) to authenticated;

create function office_private.plan_work_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (auth.uid() is null or exists(select 1 from public.profiles where id=auth.uid() and role::text in ('admin','operations_admin') and coalesce(is_active,true))) and exists(select 1 from public.office_site_plans p where p.work_date in (new.work_date,old.work_date)) then perform office_private.scan_site_plans();end if;
 return null;
exception when others then
 update office_private.site_plan_monitor set last_error=left(sqlerrm,200) where singleton;
 return null;
end;$$;
revoke all on function office_private.plan_work_changed() from public,anon,authenticated;
create trigger office_planned_hours_changed after insert or update or delete on public.work_entries for each row execute function office_private.plan_work_changed();

-- Existing revocable Mac snapshot includes the same plans; no new worker/timer on Mac.
do $$ declare s text;begin
 s=pg_get_functiondef('office_private.mac_exchange(text,jsonb)'::regprocedure);
 s=replace(s,'''office_documents'',''office_document_files''','''office_site_plans'',''office_site_plan_people'',''office_site_plan_events'',''office_documents'',''office_document_files''');
 execute s;
end;$$;

-- One lightweight database schedule. No paid model, external email or phone push.
create extension if not exists pg_cron;
create function office_private.site_plan_tick() returns void language plpgsql security definer set search_path='' as $$
begin
 perform office_private.scan_site_plans();
exception when others then
 update office_private.site_plan_monitor set last_error=left(sqlerrm,200) where singleton;
end;$$;
revoke all on function office_private.site_plan_tick() from public,anon,authenticated,service_role;
select cron.schedule('office-site-plan-reminders','*/5 * * * *','select office_private.site_plan_tick()');
