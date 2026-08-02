-- Private operations workspace and finance-only flexible-period client invoicing.
-- This migration is intentionally self-contained because production has a
-- partially stabilised legacy schema. Every addition is safe to re-run.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table public.clients
  add column if not exists address text,
  add column if not exists payment_terms_days integer not null default 14;

alter table public.clients
  drop constraint if exists clients_payment_terms_days_check,
  add constraint clients_payment_terms_days_check
  check (payment_terms_days between 0 and 90) not valid;

create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  name text not null,
  address text not null default '',
  suburb text,
  state text not null default 'WA',
  postcode text,
  site_contact_name text,
  site_contact_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sites enable row level security;

drop policy if exists "sites admin all" on public.sites;
create policy "sites admin all"
on public.sites
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop trigger if exists sites_set_updated_at on public.sites;
create trigger sites_set_updated_at
before update on public.sites
for each row execute function public.set_updated_at();

create index if not exists sites_client_id_idx on public.sites(client_id);

alter table public.jobs
  add column if not exists client_id uuid,
  add column if not exists site_id uuid,
  add column if not exists title text,
  add column if not exists trade text,
  add column if not exists starts_on date,
  add column if not exists ends_on date,
  add column if not exists created_by uuid,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.jobs'::regclass
      and conname = 'jobs_client_id_fkey'
  ) then
    alter table public.jobs
      add constraint jobs_client_id_fkey
      foreign key (client_id) references public.clients(id) on delete restrict not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.jobs'::regclass
      and conname = 'jobs_site_id_fkey'
  ) then
    alter table public.jobs
      add constraint jobs_site_id_fkey
      foreign key (site_id) references public.sites(id) on delete set null not valid;
  end if;
end $$;

create index if not exists jobs_client_id_idx on public.jobs(client_id);
create index if not exists jobs_site_id_idx on public.jobs(site_id);

drop trigger if exists jobs_set_updated_at on public.jobs;
create trigger jobs_set_updated_at
before update on public.jobs
for each row execute function public.set_updated_at();

create table if not exists public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text not null,
  invited_by uuid references public.profiles(id) on delete set null,
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email)
);

alter table public.user_invitations
  drop constraint if exists user_invitations_role_check,
  add constraint user_invitations_role_check
  check (role in ('worker', 'leading_hand', 'operations_admin', 'admin')) not valid;

alter table public.user_invitations enable row level security;

drop policy if exists "user invitations admin manage" on public.user_invitations;
create policy "user invitations admin manage"
on public.user_invitations
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "user invitations invited user read" on public.user_invitations;
create policy "user invitations invited user read"
on public.user_invitations
for select
to authenticated
using (lower(email) = lower(auth.jwt() ->> 'email'));

drop trigger if exists user_invitations_set_updated_at on public.user_invitations;
create trigger user_invitations_set_updated_at
before update on public.user_invitations
for each row execute function public.set_updated_at();

create index if not exists user_invitations_email_idx on public.user_invitations(lower(email));

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  entity_table text not null,
  entity_id uuid,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;

drop policy if exists "audit logs admin read" on public.audit_logs;
create policy "audit logs admin read"
on public.audit_logs
for select
to authenticated
using (public.is_admin());

drop policy if exists "audit logs operations insert own" on public.audit_logs;
create policy "audit logs operations insert own"
on public.audit_logs
for insert
to authenticated
with check (actor_id = auth.uid());

create index if not exists audit_logs_actor_created_idx on public.audit_logs(actor_id, created_at desc);
create index if not exists audit_logs_entity_idx on public.audit_logs(entity_table, entity_id);

create or replace function public.is_operations_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role::text = 'operations_admin'
      and coalesce(is_active, true)
  );
$$;

create or replace function public.can_access_operations()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or public.is_operations_admin();
$$;

grant execute on function public.is_operations_admin() to authenticated;
grant execute on function public.can_access_operations() to authenticated;

alter table public.work_entries
  drop constraint if exists work_entries_entry_role_check;

alter table public.work_entries
  add constraint work_entries_entry_role_check
  check (entry_role in ('admin', 'operations_admin', 'leading_hand', 'worker')) not valid;

drop policy if exists "work entries operations admin read" on public.work_entries;
create policy "work entries operations admin read"
on public.work_entries
for select
to authenticated
using (public.is_operations_admin());

drop policy if exists "work entries operations admin insert" on public.work_entries;
create policy "work entries operations admin insert"
on public.work_entries
for insert
to authenticated
with check (
  public.is_operations_admin()
  and entered_by = auth.uid()
  and entry_role = 'operations_admin'
  and approved = false
  and locked = false
);

drop policy if exists "work entries operations admin update unlocked" on public.work_entries;
create policy "work entries operations admin update unlocked"
on public.work_entries
for update
to authenticated
using (
  public.is_operations_admin()
  and approved = false
  and locked = false
)
with check (
  public.is_operations_admin()
  and approved = false
  and locked = false
  and entry_role = 'operations_admin'
);

alter table public.client_invoices
  add column if not exists gst_applied boolean not null default true,
  add column if not exists local_archive_status text not null default 'pending';

alter table public.client_invoices
  drop constraint if exists client_invoices_local_archive_status_check,
  add constraint client_invoices_local_archive_status_check
  check (local_archive_status in ('pending', 'synced', 'error')) not valid;

create index if not exists client_invoice_items_invoice_idx
on public.client_invoice_items(client_invoice_id);

create unique index if not exists client_invoice_items_work_entry_unique_idx
on public.client_invoice_items(work_entry_id)
where work_entry_id is not null;

create sequence if not exists public.client_invoice_sequence start with 1;

create or replace function public.create_operations_client_invoice(
  p_client_id uuid,
  p_project_ids uuid[],
  p_period_start date,
  p_period_end date,
  p_rate_per_tonne numeric,
  p_gst_applied boolean default true
)
returns table (
  invoice_id uuid,
  invoice_number text,
  subtotal numeric,
  gst_amount numeric,
  total_amount numeric,
  entry_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_id uuid;
  v_invoice_number text;
  v_subtotal numeric(12,2);
  v_gst numeric(12,2);
  v_total numeric(12,2);
  v_total_tonnes numeric(12,3);
  v_entry_count integer;
  v_sequence bigint;
  v_payment_terms integer;
begin
  if not public.is_admin() then
    raise exception 'Finance admin access required.' using errcode = '42501';
  end if;

  if p_client_id is null
    or coalesce(array_length(p_project_ids, 1), 0) = 0
    or p_period_start is null
    or p_period_end is null
    or p_period_end < p_period_start
    or coalesce(p_rate_per_tonne, 0) <= 0 then
    raise exception 'Client, project, valid invoice period and positive rate are required.';
  end if;

  if exists (
    select 1
    from unnest(p_project_ids) selected_project_id
    left join public.jobs j on j.id = selected_project_id
    where j.id is null or j.client_id is distinct from p_client_id
  ) then
    raise exception 'Every selected project must belong to the selected client.';
  end if;

  select coalesce(payment_terms_days, 14)
  into v_payment_terms
  from public.clients
  where id = p_client_id
    and coalesce(is_active, true);

  if v_payment_terms is null then
    raise exception 'The selected client is inactive or unavailable.';
  end if;

  select
    count(*)::integer,
    round(sum(round((we.hours / 10.0), 3)), 3),
    round(sum(round((we.hours / 10.0), 3) * p_rate_per_tonne), 2)
  into v_entry_count, v_total_tonnes, v_subtotal
  from public.work_entries we
  where we.job_id = any(p_project_ids)
    and we.work_date between p_period_start and p_period_end
    and we.hours > 0
    and not exists (
      select 1
      from public.client_invoice_items existing_item
      where existing_item.work_entry_id = we.id
    );

  if coalesce(v_entry_count, 0) = 0 then
    raise exception 'No uninvoiced production records were found for this selection.';
  end if;

  v_total_tonnes := coalesce(v_total_tonnes, 0);
  v_subtotal := coalesce(v_subtotal, 0);
  v_gst := case when p_gst_applied then round(v_subtotal * 0.10, 2) else 0 end;
  v_total := v_subtotal + v_gst;
  v_sequence := nextval('public.client_invoice_sequence');
  v_invoice_number := 'CINV-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(v_sequence::text, 4, '0');

  insert into public.client_invoices (
    client_id,
    invoice_number,
    status,
    period_start,
    period_end,
    payment_status,
    subtotal,
    gst,
    gst_amount,
    total,
    total_amount,
    rate_per_tonne,
    total_tonnes,
    gst_applied,
    local_archive_status,
    due_on,
    notes,
    created_by
  ) values (
    p_client_id,
    v_invoice_number,
    'draft',
    p_period_start,
    p_period_end,
    'unpaid',
    v_subtotal,
    v_gst,
    v_gst,
    v_total,
    v_total,
    p_rate_per_tonne,
    v_total_tonnes,
    p_gst_applied,
    'pending',
    current_date + v_payment_terms,
    'Generated from operational records in the selected invoice period.',
    auth.uid()
  ) returning id into v_invoice_id;

  insert into public.client_invoice_items (
    client_invoice_id,
    work_entry_id,
    job_id,
    description,
    hours,
    tonnes,
    rate,
    total,
    work_date,
    site_name
  )
  select
    v_invoice_id,
    we.id,
    we.job_id,
    'Reinforcement subcontract services - ' || coalesce(nullif(j.site_name, ''), nullif(j.title, ''), 'Project scope'),
    we.hours,
    round((we.hours / 10.0), 3),
    p_rate_per_tonne,
    round(round((we.hours / 10.0), 3) * p_rate_per_tonne, 2),
    we.work_date,
    coalesce(nullif(j.location, ''), nullif(j.site_name, ''), 'Project site')
  from public.work_entries we
  join public.jobs j on j.id = we.job_id
  where we.job_id = any(p_project_ids)
    and we.work_date between p_period_start and p_period_end
    and we.hours > 0
    and not exists (
      select 1
      from public.client_invoice_items existing_item
      where existing_item.work_entry_id = we.id
    )
  order by we.work_date, we.job_id, we.worker_id;

  update public.work_entries we
  set
    approved = true,
    approved_by = auth.uid(),
    approved_at = now(),
    locked = true,
    updated_at = now()
  where exists (
    select 1
    from public.client_invoice_items item
    where item.client_invoice_id = v_invoice_id
      and item.work_entry_id = we.id
  );

  return query
  select v_invoice_id, v_invoice_number, v_subtotal, v_gst, v_total, v_entry_count;
end;
$$;

revoke all on function public.create_operations_client_invoice(uuid, uuid[], date, date, numeric, boolean) from public;
grant execute on function public.create_operations_client_invoice(uuid, uuid[], date, date, numeric, boolean) to authenticated;

notify pgrst, 'reload schema';
