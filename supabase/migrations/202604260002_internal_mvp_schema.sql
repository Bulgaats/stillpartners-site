create extension if not exists "pgcrypto";

do $$
begin
  create type public.timesheet_status as enum ('draft', 'submitted', 'approved', 'rejected');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.correction_request_status as enum ('requested', 'approved', 'rejected');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.invoice_payment_status as enum ('pending', 'sent', 'paid', 'void');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.rate_request_status as enum ('pending_worker_approval', 'approved', 'rejected');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.notification_status as enum ('unread', 'read');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  abn text,
  email text,
  phone text,
  address text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.worker_profiles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  trade text,
  abn text,
  bank_account_name text,
  bsb text,
  account_number text,
  tax_notes text,
  status text not null default 'active',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.profiles(id) on delete cascade,
  certificate_type text not null,
  title text not null,
  issuer text,
  issued_on date,
  expires_on date,
  status text not null default 'pending',
  storage_path text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agreement_addendums (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  status text not null default 'pending_worker_approval',
  signed_at timestamptz,
  storage_path text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.timesheets (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  worker_id uuid not null references public.profiles(id) on delete cascade,
  submitted_by uuid references public.profiles(id) on delete set null,
  work_date date not null,
  hours numeric(6, 2) not null check (hours >= 0 and hours <= 24),
  tonnes numeric(8, 3) generated always as (round(hours / 10.0, 3)) stored,
  break_minutes integer not null default 0 check (break_minutes >= 0),
  notes text,
  status public.timesheet_status not null default 'draft',
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  locked_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, worker_id, work_date)
);

create table if not exists public.timesheet_correction_requests (
  id uuid primary key default gen_random_uuid(),
  timesheet_id uuid references public.timesheets(id) on delete cascade,
  worker_id uuid not null references public.profiles(id) on delete cascade,
  requested_hours numeric(6, 2) not null check (requested_hours >= 0 and requested_hours <= 24),
  reason text not null,
  status public.correction_request_status not null default 'requested',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.timesheet_correction_requests
add column if not exists timesheet_id uuid references public.timesheets(id) on delete cascade;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'timesheet_correction_requests'
      and column_name = 'daily_hours_id'
  ) then
    alter table public.timesheet_correction_requests
    alter column daily_hours_id drop not null;
  end if;
end $$;

create table if not exists public.rate_change_requests (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.profiles(id) on delete cascade,
  old_rate_id uuid references public.worker_rates(id) on delete set null,
  proposed_rate numeric(12, 2) not null check (proposed_rate >= 0),
  status public.rate_request_status not null default 'pending_worker_approval',
  agreement_addendum_id uuid references public.agreement_addendums(id) on delete set null,
  approved_by_worker_at timestamptz,
  rejected_by_worker_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.worker_invoices (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.profiles(id) on delete cascade,
  invoice_number text not null unique,
  period_start date not null,
  period_end date not null,
  subtotal numeric(12, 2) not null default 0,
  gst numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  payment_status public.invoice_payment_status not null default 'pending',
  paid_at timestamptz,
  storage_path text,
  reply_to_email text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create table if not exists public.worker_invoice_items (
  id uuid primary key default gen_random_uuid(),
  worker_invoice_id uuid not null references public.worker_invoices(id) on delete cascade,
  timesheet_id uuid references public.timesheets(id) on delete set null,
  description text not null,
  hours numeric(8, 2) not null default 0,
  tonnes numeric(8, 3) not null default 0,
  rate numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.client_invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  invoice_number text not null unique,
  period_start date not null,
  period_end date not null,
  subtotal numeric(12, 2) not null default 0,
  gst numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  payment_status public.invoice_payment_status not null default 'pending',
  paid_at timestamptz,
  storage_path text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create table if not exists public.client_invoice_items (
  id uuid primary key default gen_random_uuid(),
  client_invoice_id uuid not null references public.client_invoices(id) on delete cascade,
  timesheet_id uuid references public.timesheets(id) on delete set null,
  description text not null,
  hours numeric(8, 2) not null default 0,
  tonnes numeric(8, 3) not null default 0,
  rate numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  status public.notification_status not null default 'unread',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  entity_table text not null,
  entity_id uuid,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.prevent_locked_timesheet_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.locked_at is not null and not public.is_admin() then
    raise exception 'Approved timesheets are locked';
  end if;

  if new.status = 'approved' then
    new.approved_at = coalesce(new.approved_at, now());
    new.locked_at = coalesce(new.locked_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists timesheets_prevent_locked_update on public.timesheets;
create trigger timesheets_prevent_locked_update
before insert or update on public.timesheets
for each row execute function public.prevent_locked_timesheet_update();

drop trigger if exists companies_updated_at on public.companies;
create trigger companies_updated_at before update on public.companies
for each row execute function public.set_updated_at();
drop trigger if exists worker_profiles_updated_at on public.worker_profiles;
create trigger worker_profiles_updated_at before update on public.worker_profiles
for each row execute function public.set_updated_at();
drop trigger if exists certificates_updated_at on public.certificates;
create trigger certificates_updated_at before update on public.certificates
for each row execute function public.set_updated_at();
drop trigger if exists agreement_addendums_updated_at on public.agreement_addendums;
create trigger agreement_addendums_updated_at before update on public.agreement_addendums
for each row execute function public.set_updated_at();
drop trigger if exists timesheets_updated_at on public.timesheets;
create trigger timesheets_updated_at before update on public.timesheets
for each row execute function public.set_updated_at();
drop trigger if exists correction_requests_updated_at on public.timesheet_correction_requests;
create trigger correction_requests_updated_at before update on public.timesheet_correction_requests
for each row execute function public.set_updated_at();
drop trigger if exists rate_change_requests_updated_at on public.rate_change_requests;
create trigger rate_change_requests_updated_at before update on public.rate_change_requests
for each row execute function public.set_updated_at();
drop trigger if exists worker_invoices_updated_at on public.worker_invoices;
create trigger worker_invoices_updated_at before update on public.worker_invoices
for each row execute function public.set_updated_at();
drop trigger if exists client_invoices_updated_at on public.client_invoices;
create trigger client_invoices_updated_at before update on public.client_invoices
for each row execute function public.set_updated_at();
drop trigger if exists notifications_updated_at on public.notifications;
create trigger notifications_updated_at before update on public.notifications
for each row execute function public.set_updated_at();

alter table public.companies enable row level security;
alter table public.worker_profiles enable row level security;
alter table public.certificates enable row level security;
alter table public.agreement_addendums enable row level security;
alter table public.timesheets enable row level security;
alter table public.timesheet_correction_requests enable row level security;
alter table public.rate_change_requests enable row level security;
alter table public.worker_invoices enable row level security;
alter table public.worker_invoice_items enable row level security;
alter table public.client_invoices enable row level security;
alter table public.client_invoice_items enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

create policy "companies admin manage" on public.companies
for all using (public.is_admin()) with check (public.is_admin());

create policy "worker profiles own or admin read" on public.worker_profiles
for select using (profile_id = auth.uid() or public.is_admin());
create policy "worker profiles own update" on public.worker_profiles
for update using (profile_id = auth.uid() or public.is_admin())
with check (profile_id = auth.uid() or public.is_admin());
create policy "worker profiles admin insert" on public.worker_profiles
for insert with check (public.is_admin() or profile_id = auth.uid());

create policy "certificates own crew admin read" on public.certificates
for select using (
  worker_id = auth.uid()
  or public.is_leading_hand_for_worker(worker_id)
  or public.is_admin()
);
create policy "certificates worker insert own" on public.certificates
for insert with check (worker_id = auth.uid());
create policy "certificates worker update own pending" on public.certificates
for update using (worker_id = auth.uid() and status = 'pending')
with check (worker_id = auth.uid());
create policy "certificates admin manage" on public.certificates
for all using (public.is_admin()) with check (public.is_admin());

create policy "addendums own or admin read" on public.agreement_addendums
for select using (worker_id = auth.uid() or public.is_admin());
create policy "addendums admin manage" on public.agreement_addendums
for all using (public.is_admin()) with check (public.is_admin());

create policy "timesheets own crew admin read" on public.timesheets
for select using (
  worker_id = auth.uid()
  or public.is_leading_hand_for_worker(worker_id)
  or public.is_admin()
);
create policy "timesheets worker draft insert" on public.timesheets
for insert with check (
  worker_id = auth.uid()
  or public.is_leading_hand_for_worker(worker_id)
  or public.is_admin()
);
create policy "timesheets draft update only" on public.timesheets
for update using (
  locked_at is null
  and status in ('draft', 'submitted')
  and (
    worker_id = auth.uid()
    or public.is_leading_hand_for_worker(worker_id)
    or public.is_admin()
  )
) with check (
  locked_at is null
  and status in ('draft', 'submitted', 'approved', 'rejected')
  and (
    worker_id = auth.uid()
    or public.is_leading_hand_for_worker(worker_id)
    or public.is_admin()
  )
);

create policy "corrections own crew admin read" on public.timesheet_correction_requests
for select using (
  worker_id = auth.uid()
  or public.is_leading_hand_for_worker(worker_id)
  or public.is_admin()
);
create policy "corrections worker insert own" on public.timesheet_correction_requests
for insert with check (worker_id = auth.uid());
create policy "corrections admin manage" on public.timesheet_correction_requests
for all using (public.is_admin()) with check (public.is_admin());

create policy "worker rates admin manage only" on public.rate_change_requests
for all using (public.is_admin()) with check (public.is_admin());
create policy "worker rate requests worker read own" on public.rate_change_requests
for select using (worker_id = auth.uid() or public.is_admin());

create policy "worker invoices own or admin read" on public.worker_invoices
for select using (worker_id = auth.uid() or public.is_admin());
create policy "worker invoices admin manage" on public.worker_invoices
for all using (public.is_admin()) with check (public.is_admin());
create policy "worker invoice items own or admin read" on public.worker_invoice_items
for select using (
  exists (
    select 1 from public.worker_invoices wi
    where wi.id = worker_invoice_items.worker_invoice_id
      and (wi.worker_id = auth.uid() or public.is_admin())
  )
);
create policy "worker invoice items admin manage" on public.worker_invoice_items
for all using (public.is_admin()) with check (public.is_admin());

create policy "client invoices admin only" on public.client_invoices
for all using (public.is_admin()) with check (public.is_admin());
create policy "client invoice items admin only" on public.client_invoice_items
for all using (public.is_admin()) with check (public.is_admin());

create policy "notifications own read" on public.notifications
for select using (profile_id = auth.uid() or public.is_admin());
create policy "notifications own update read status" on public.notifications
for update using (profile_id = auth.uid() or public.is_admin())
with check (profile_id = auth.uid() or public.is_admin());
create policy "notifications admin insert" on public.notifications
for insert with check (public.is_admin());

create policy "audit logs admin read" on public.audit_logs
for select using (public.is_admin());
create policy "audit logs admin insert" on public.audit_logs
for insert with check (public.is_admin());

insert into storage.buckets (id, name, public)
values
  ('certificates', 'certificates', false),
  ('agreements', 'agreements', false),
  ('invoices', 'invoices', false)
on conflict (id) do nothing;

create index if not exists worker_profiles_status_idx on public.worker_profiles(status);
create index if not exists certificates_worker_id_idx on public.certificates(worker_id);
create index if not exists agreement_addendums_worker_id_idx on public.agreement_addendums(worker_id);
create index if not exists timesheets_worker_date_idx on public.timesheets(worker_id, work_date);
create index if not exists timesheets_job_worker_date_idx on public.timesheets(job_id, worker_id, work_date);
create index if not exists correction_requests_worker_status_idx on public.timesheet_correction_requests(worker_id, status);
create index if not exists rate_change_requests_worker_status_idx on public.rate_change_requests(worker_id, status);
create index if not exists worker_invoices_worker_period_idx on public.worker_invoices(worker_id, period_start, period_end);
create index if not exists client_invoices_client_period_idx on public.client_invoices(client_id, period_start, period_end);
create index if not exists notifications_profile_status_idx on public.notifications(profile_id, status);
create index if not exists audit_logs_entity_idx on public.audit_logs(entity_table, entity_id);
