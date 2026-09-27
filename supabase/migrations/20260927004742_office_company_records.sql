create table public.office_company_records (
 id uuid primary key default gen_random_uuid(),
 kind text not null check(kind in ('memory','work')),
 title text not null check(length(trim(title)) between 2 and 160),
 body text not null default '' check(length(body)<=4000),
 status text not null,
 category text not null default '' check(category in ('','decision','agreement','preference','rule')),
 priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),
 due_date date, effective_date date,
 next_action text not null default '' check(length(next_action)<=1000),
 outcome text not null default '' check(length(outcome)<=2000),
 source_ref text not null default '' check(length(source_ref)<=500),
 version integer not null default 1,
 created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check((kind='memory' and status in ('confirmed','superseded') and category<>'' and length(trim(body))>=3)
 or (kind='work' and status in ('open','waiting_external','waiting_mac','needs_review','completed','cancelled')
 and category='' and (status in ('completed','cancelled') or length(trim(next_action))>=3)
 and (status not in ('completed','cancelled') or length(trim(outcome))>=3)))
);
create index office_company_records_queue on public.office_company_records(kind,status,due_date);
create table public.office_company_record_events (
 id uuid primary key,record_id uuid not null references public.office_company_records(id),
 actor_id uuid not null references auth.users(id),source_task uuid references public.office_assistant_tasks(id),
 request jsonb not null,before_data jsonb,after_data jsonb not null,created_at timestamptz not null default now()
);
create index office_company_events_record on public.office_company_record_events(record_id,created_at);
create unique index office_company_events_task on public.office_company_record_events(source_task) where source_task is not null;
alter table public.office_company_records enable row level security;
alter table public.office_company_record_events enable row level security;
revoke all on public.office_company_records,public.office_company_record_events from public,anon,authenticated;
grant select on public.office_company_records,public.office_company_record_events to authenticated;
create policy finance_company_records_read on public.office_company_records for select to authenticated using((select public.is_admin()));
create policy finance_company_events_read on public.office_company_record_events for select to authenticated using((select public.is_admin()));

create function office_private.save_company_record(p_event uuid,p_record jsonb,p_task uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare r jsonb:=p_record;task public.office_assistant_tasks%rowtype;old public.office_company_records%rowtype;
 saved public.office_company_record_events%rowtype;v_id uuid;v_kind text;v_status text;v_title text;v_body text;v_category text;v_priority text;
 v_due date;v_effective date;v_next text;v_outcome text;v_source text;before_value jsonb;after_value jsonb;request_value jsonb;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Finance admin access required'; end if;
 if p_event is null then raise exception 'A stable action ID is required'; end if;
 perform pg_advisory_xact_lock(917265);
 if p_task is not null then
  select * into task from public.office_assistant_tasks where id=p_task and user_id=auth.uid() for update;
  if not found or task.status<>'done' or task.response->>'action'<>'save_company_record' then raise exception 'Completed company record proposal not found'; end if;
  if task.applied_id is not null then return task.applied_id; end if;
  r=task.response->'companyRecord';
 end if;
 if jsonb_typeof(r) is distinct from 'object' then raise exception 'Invalid company record'; end if;
 request_value=jsonb_build_object('record',r,'task',p_task);
 select * into saved from public.office_company_record_events where id=p_event;
 if found then
  if saved.actor_id<>auth.uid() or saved.request<>request_value then raise exception 'Action ID was already used for another request'; end if;
  return saved.record_id;
 end if;
 v_id=nullif(r->>'id','')::uuid;v_kind=r->>'kind';v_status=r->>'status';v_title=btrim(coalesce(r->>'title',''));v_body=btrim(coalesce(r->>'body',''));
 v_category=coalesce(r->>'category','');v_priority=coalesce(r->>'priority','normal');v_next=btrim(coalesce(r->>'nextAction',''));
 v_outcome=btrim(coalesce(r->>'outcome',''));v_source=btrim(coalesce(r->>'sourceRef',''));
 v_due=nullif(r->>'dueDate','')::date;v_effective=nullif(r->>'effectiveDate','')::date;
 if v_kind is null or v_kind not in ('memory','work') or length(v_title) not between 2 and 160 or length(v_body)>4000
  or length(v_next)>1000 or length(v_outcome)>2000 or length(v_source)>500
  or v_priority not in ('low','normal','high','urgent') then raise exception 'Check company record details'; end if;
 if v_kind='memory' then
  if coalesce(v_status,'') not in ('confirmed','superseded') or v_category not in ('decision','agreement','preference','rule') or length(v_body)<3 then raise exception 'Confirm the memory category and details'; end if;
  v_due=null;v_next='';v_outcome='';
 else
  if coalesce(v_status,'') not in ('open','waiting_external','waiting_mac','needs_review','completed','cancelled') then raise exception 'Check the work status'; end if;
  if v_status in ('completed','cancelled') and length(v_outcome)<3 then raise exception 'Record the outcome and evidence before closing this work'; end if;
  if v_status not in ('completed','cancelled') and length(v_next)<3 then raise exception 'An open task needs a next action or waiting reason'; end if;
  v_category='';v_effective=null;
 end if;
 if v_id is null then
  if coalesce((r->>'expectedVersion')::integer,0)<>0 then raise exception 'Invalid new record version'; end if;
  if v_kind='work' and v_status in ('completed','cancelled') then raise exception 'Create an open work item first'; end if;
  insert into public.office_company_records(kind,title,body,status,category,priority,due_date,effective_date,next_action,outcome,source_ref,created_by,updated_by)
   values(v_kind,v_title,v_body,v_status,v_category,v_priority,v_due,v_effective,v_next,v_outcome,v_source,auth.uid(),auth.uid()) returning id,to_jsonb(office_company_records.*) into v_id,after_value;
 else
  select * into old from public.office_company_records where id=v_id for update;
  if not found or old.kind<>v_kind then raise exception 'Company record not found'; end if;
  if old.version is distinct from (r->>'expectedVersion')::integer then raise exception 'This record changed. Refresh and review the latest version'; end if;
  before_value=to_jsonb(old);
  update public.office_company_records set title=v_title,body=v_body,status=v_status,category=v_category,priority=v_priority,due_date=v_due,effective_date=v_effective,next_action=v_next,outcome=v_outcome,source_ref=v_source,version=version+1,updated_by=auth.uid(),updated_at=now()
   where id=v_id returning to_jsonb(office_company_records.*) into after_value;
 end if;
 insert into public.office_company_record_events(id,record_id,actor_id,source_task,request,before_data,after_data)
  values(p_event,v_id,auth.uid(),p_task,request_value,before_value,after_value);
 if p_task is not null then update public.office_assistant_tasks set applied_id=v_id,applied_at=now() where id=p_task; end if;
 return v_id;
end;$$;
revoke all on function office_private.save_company_record(uuid,jsonb,uuid) from public,anon;
grant execute on function office_private.save_company_record(uuid,jsonb,uuid) to authenticated;
create function public.office_save_company_record(p_event uuid,p_record jsonb,p_task uuid default null) returns uuid language sql security invoker set search_path='' as $$select office_private.save_company_record(p_event,p_record,p_task);$$;
revoke all on function public.office_save_company_record(uuid,jsonb,uuid) from public,anon;
grant execute on function public.office_save_company_record(uuid,jsonb,uuid) to authenticated;
