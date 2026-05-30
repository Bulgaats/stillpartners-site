-- Consolidated production schema stabilization for Still Partners invoice/rate workflows.
-- Idempotent and safe for partially migrated production databases.

create extension if not exists pgcrypto;

do $$
begin
  create type public.rate_kind as enum ('hourly', 'tonne');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.rate_approval_status as enum ('pending_worker_approval', 'approved', 'rejected');
exception
  when duplicate_object then null;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if to_regclass('public.profiles') is null then
    return false;
  end if;

  return exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role::text = 'admin'
      and coalesce(is_active, true)
  );
end;
$$;

create or replace function public.is_worker_auth(target_worker_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if target_worker_id is null or to_regclass('public.workers') is null then
    return false;
  end if;

  return exists (
    select 1
    from public.workers
    where id = target_worker_id
      and auth_user_id = auth.uid()
      and coalesce(account_enabled, true)
  );
end;
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_worker_auth(uuid) to authenticated;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Unnamed client',
  billing_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clients
  add column if not exists name text,
  add column if not exists abn text,
  add column if not exists billing_email text,
  add column if not exists contact_name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists address text,
  add column if not exists payment_terms_days integer not null default 14,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.clients
set
  name = coalesce(nullif(name, ''), contact_name, email, 'Unnamed client'),
  billing_email = coalesce(nullif(billing_email, ''), email),
  payment_terms_days = coalesce(payment_terms_days, 14),
  is_active = coalesce(is_active, true),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where true;

alter table public.clients
  alter column name set default 'Unnamed client',
  alter column name set not null,
  alter column payment_terms_days set default 14,
  alter column payment_terms_days set not null,
  alter column is_active set default true,
  alter column is_active set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

create table if not exists public.workers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null default 'Unnamed contractor',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workers
  add column if not exists full_name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists trade text,
  add column if not exists abn text,
  add column if not exists gst_registered boolean not null default false,
  add column if not exists gst_registered_confirmed_at timestamptz,
  add column if not exists bank_name text,
  add column if not exists bsb text,
  add column if not exists account_number text,
  add column if not exists profile_complete boolean not null default false,
  add column if not exists profile_completed_at timestamptz,
  add column if not exists auth_user_id uuid,
  add column if not exists invited_at timestamptz,
  add column if not exists invite_accepted_at timestamptz,
  add column if not exists account_enabled boolean not null default true,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.workers
set
  full_name = coalesce(nullif(full_name, ''), 'Unnamed contractor'),
  gst_registered = coalesce(gst_registered, false),
  profile_complete = coalesce(profile_complete, false),
  account_enabled = coalesce(account_enabled, true),
  is_active = coalesce(is_active, true),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where true;

alter table public.workers
  alter column full_name set default 'Unnamed contractor',
  alter column full_name set not null,
  alter column gst_registered set default false,
  alter column gst_registered set not null,
  alter column profile_complete set default false,
  alter column profile_complete set not null,
  alter column account_enabled set default true,
  alter column account_enabled set not null,
  alter column is_active set default true,
  alter column is_active set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  client_id uuid,
  name text not null default 'Project site',
  address text not null default '',
  state text not null default 'WA',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sites
  add column if not exists client_id uuid,
  add column if not exists name text,
  add column if not exists address text,
  add column if not exists suburb text,
  add column if not exists state text not null default 'WA',
  add column if not exists postcode text,
  add column if not exists site_contact_name text,
  add column if not exists site_contact_phone text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.sites
set
  name = coalesce(nullif(name, ''), 'Project site'),
  address = coalesce(address, ''),
  state = coalesce(state, 'WA'),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where true;

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  site_name text,
  client_company text,
  location text,
  start_date date,
  end_date date,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.jobs
  add column if not exists client_id uuid,
  add column if not exists site_id uuid,
  add column if not exists title text,
  add column if not exists trade text,
  add column if not exists starts_on date,
  add column if not exists ends_on date,
  add column if not exists start_time time,
  add column if not exists status text not null default 'active',
  add column if not exists leading_hand_id uuid,
  add column if not exists selected_leading_hand_worker_id uuid,
  add column if not exists notes text,
  add column if not exists created_by uuid,
  add column if not exists site_name text,
  add column if not exists client_company text,
  add column if not exists location text,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists scope_summary text,
  add column if not exists estimated_timeframe text,
  add column if not exists production_target numeric,
  add column if not exists completion_percent numeric not null default 0,
  add column if not exists project_status text not null default 'planned',
  add column if not exists archived_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.jobs
set
  site_name = coalesce(site_name, title),
  client_company = coalesce(client_company, ''),
  location = coalesce(location, ''),
  start_date = coalesce(start_date, starts_on),
  end_date = coalesce(end_date, ends_on),
  title = coalesce(title, site_name, 'Project'),
  trade = coalesce(trade, 'Subcontract services'),
  starts_on = coalesce(starts_on, start_date, current_date),
  status = coalesce(status, 'active'),
  completion_percent = coalesce(completion_percent, 0),
  project_status = coalesce(project_status, case when status = 'completed' then 'completed' else 'planned' end),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where true;

alter table public.jobs
  drop constraint if exists jobs_status_check,
  add constraint jobs_status_check
  check (status::text in ('draft', 'scheduled', 'active', 'completed', 'archived', 'cancelled')) not valid;

alter table public.jobs
  drop constraint if exists jobs_project_status_check,
  add constraint jobs_project_status_check
  check (project_status in ('planned', 'awaiting_participation', 'active', 'nearing_completion', 'completed', 'archived')) not valid;

alter table public.jobs
  drop constraint if exists jobs_completion_percent_check,
  add constraint jobs_completion_percent_check
  check (completion_percent >= 0 and completion_percent <= 100) not valid;

create table if not exists public.work_entries (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid,
  job_id uuid,
  work_date date not null default current_date,
  hours numeric(10,2) not null default 0,
  tonnes numeric(10,3) not null default 0,
  approved boolean not null default false,
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.work_entries
  add column if not exists worker_id uuid,
  add column if not exists job_id uuid,
  add column if not exists assignment_id uuid,
  add column if not exists work_date date,
  add column if not exists hours numeric(10,2) not null default 0,
  add column if not exists tonnes numeric(10,3) not null default 0,
  add column if not exists entered_by uuid,
  add column if not exists entry_role text not null default 'admin',
  add column if not exists approved boolean not null default false,
  add column if not exists approved_by uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists locked boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.work_entries
set
  work_date = coalesce(work_date, current_date),
  hours = coalesce(hours, 0),
  tonnes = coalesce(tonnes, round((coalesce(hours, 0) / 10.0)::numeric, 3)),
  entry_role = coalesce(entry_role, 'admin'),
  approved = coalesce(approved, false),
  locked = coalesce(locked, false),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where true;

alter table public.work_entries
  drop constraint if exists work_entries_entry_role_check,
  add constraint work_entries_entry_role_check
  check (entry_role in ('admin', 'leading_hand', 'worker')) not valid;

create table if not exists public.worker_rates (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid,
  trade text not null default 'Subcontract services',
  kind text not null default 'tonne',
  pay_rate numeric(12,2) not null default 0,
  approval_status text not null default 'approved',
  effective_from date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.worker_rates
  add column if not exists worker_id uuid,
  add column if not exists trade text,
  add column if not exists kind text not null default 'tonne',
  add column if not exists pay_rate numeric(12,2) not null default 0,
  add column if not exists approval_status text not null default 'approved',
  add column if not exists approved_by_worker_at timestamptz,
  add column if not exists rejected_by_worker_at timestamptz,
  add column if not exists worker_rejection_reason text,
  add column if not exists effective_from date not null default current_date,
  add column if not exists effective_to date,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now();

update public.worker_rates
set
  trade = coalesce(trade, 'Subcontract services'),
  kind = coalesce(kind, 'tonne'),
  pay_rate = coalesce(pay_rate, 0),
  approval_status = coalesce(approval_status, 'approved'),
  effective_from = coalesce(effective_from, current_date),
  created_at = coalesce(created_at, now())
where true;

alter table public.worker_rates
  alter column trade set default 'Subcontract services',
  alter column trade set not null,
  alter column kind set default 'tonne',
  alter column kind set not null,
  alter column pay_rate set default 0,
  alter column pay_rate set not null,
  alter column approval_status set default 'approved',
  alter column approval_status set not null,
  alter column effective_from set default current_date,
  alter column effective_from set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

alter table public.worker_rates
  drop constraint if exists worker_rates_approval_status_check,
  add constraint worker_rates_approval_status_check
  check (approval_status::text in ('pending_worker_approval', 'approved', 'rejected', 'active')) not valid;

alter table public.worker_rates
  drop constraint if exists worker_rates_pay_rate_check,
  add constraint worker_rates_pay_rate_check
  check (pay_rate >= 0) not valid;

create table if not exists public.client_rates (
  id uuid primary key default gen_random_uuid(),
  client_id uuid,
  trade text not null default 'Subcontract services',
  kind text not null default 'tonne',
  charge_rate numeric(12,2) not null default 0,
  effective_from date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.client_rates
  add column if not exists client_id uuid,
  add column if not exists trade text,
  add column if not exists kind text not null default 'tonne',
  add column if not exists charge_rate numeric(12,2) not null default 0,
  add column if not exists effective_from date not null default current_date,
  add column if not exists effective_to date,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now();

update public.client_rates
set
  trade = coalesce(trade, 'Subcontract services'),
  kind = coalesce(kind, 'tonne'),
  charge_rate = coalesce(charge_rate, 0),
  effective_from = coalesce(effective_from, current_date),
  created_at = coalesce(created_at, now())
where true;

create table if not exists public.worker_invoices (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid,
  invoice_number text,
  period_start date,
  period_end date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.worker_invoices
  add column if not exists worker_id uuid,
  add column if not exists invoice_number text,
  add column if not exists period_start date,
  add column if not exists period_end date,
  add column if not exists payment_status text,
  add column if not exists status text not null default 'draft',
  add column if not exists total_hours numeric(10,2) not null default 0,
  add column if not exists total_tonnes numeric(10,3) not null default 0,
  add column if not exists rate_per_tonne numeric(12,2),
  add column if not exists subtotal numeric(12,2),
  add column if not exists gst_registered boolean not null default false,
  add column if not exists gst_amount numeric(12,2) not null default 0,
  add column if not exists total_amount numeric(12,2),
  add column if not exists total numeric(12,2),
  add column if not exists invoice_title text,
  add column if not exists storage_path text,
  add column if not exists pdf_url text,
  add column if not exists email_status text,
  add column if not exists due_on date,
  add column if not exists notes text,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by_worker_at timestamptz,
  add column if not exists submitted_at timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.worker_invoices
set
  payment_status = coalesce(payment_status, status, 'draft'),
  status = coalesce(status, payment_status, 'draft'),
  total_hours = coalesce(total_hours, 0),
  total_tonnes = coalesce(total_tonnes, 0),
  subtotal = coalesce(subtotal, total, total_amount, 0),
  gst_registered = coalesce(gst_registered, false),
  gst_amount = coalesce(gst_amount, 0),
  total_amount = coalesce(total_amount, total, subtotal + gst_amount, 0),
  total = coalesce(total, total_amount, subtotal + gst_amount, 0),
  invoice_title = coalesce(invoice_title, case when coalesce(gst_registered, false) then 'Tax Invoice' else 'Invoice' end),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where true;

alter table public.worker_invoices
  drop constraint if exists worker_invoices_status_check,
  add constraint worker_invoices_status_check
  check (status::text in ('draft', 'approved_by_worker', 'submitted', 'paid')) not valid;

alter table public.worker_invoices
  drop constraint if exists worker_invoices_payment_status_check,
  add constraint worker_invoices_payment_status_check
  check (payment_status is null or payment_status::text in ('draft', 'approved', 'submitted', 'sent', 'paid', 'cancelled')) not valid;

create table if not exists public.worker_invoice_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.worker_invoice_items
  add column if not exists worker_invoice_id uuid,
  add column if not exists invoice_id uuid,
  add column if not exists timesheet_id uuid,
  add column if not exists work_entry_id uuid,
  add column if not exists worker_id uuid,
  add column if not exists job_id uuid,
  add column if not exists description text,
  add column if not exists hours numeric(10,2) not null default 0,
  add column if not exists tonnes numeric(10,3) not null default 0,
  add column if not exists rate numeric(12,2),
  add column if not exists total numeric(12,2),
  add column if not exists work_date date,
  add column if not exists site_name text,
  add column if not exists created_at timestamptz not null default now();

update public.worker_invoice_items
set
  invoice_id = coalesce(invoice_id, worker_invoice_id),
  worker_invoice_id = coalesce(worker_invoice_id, invoice_id),
  hours = coalesce(hours, 0),
  tonnes = coalesce(tonnes, 0),
  created_at = coalesce(created_at, now())
where true;

create table if not exists public.client_invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid,
  invoice_number text,
  period_start date,
  period_end date,
  payment_status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.client_invoices
  add column if not exists client_id uuid,
  add column if not exists invoice_number text,
  add column if not exists period_start date,
  add column if not exists period_end date,
  add column if not exists payment_status text not null default 'draft',
  add column if not exists subtotal numeric(12,2) not null default 0,
  add column if not exists gst_amount numeric(12,2) not null default 0,
  add column if not exists total_amount numeric(12,2) not null default 0,
  add column if not exists total numeric(12,2),
  add column if not exists pdf_url text,
  add column if not exists storage_path text,
  add column if not exists sent_at timestamptz,
  add column if not exists email_status text,
  add column if not exists due_on date,
  add column if not exists notes text,
  add column if not exists paid_at timestamptz,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.client_invoices
set
  payment_status = coalesce(payment_status, 'draft'),
  subtotal = coalesce(subtotal, total, total_amount, 0),
  gst_amount = coalesce(gst_amount, 0),
  total_amount = coalesce(total_amount, total, subtotal + gst_amount, 0),
  total = coalesce(total, total_amount, subtotal + gst_amount, 0),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where true;

alter table public.client_invoices
  drop constraint if exists client_invoices_payment_status_check,
  add constraint client_invoices_payment_status_check
  check (payment_status::text in ('draft', 'pending', 'sent', 'paid', 'cancelled')) not valid;

create table if not exists public.client_invoice_items (
  id uuid primary key default gen_random_uuid(),
  client_invoice_id uuid,
  created_at timestamptz not null default now()
);

alter table public.client_invoice_items
  add column if not exists client_invoice_id uuid,
  add column if not exists timesheet_id uuid,
  add column if not exists work_entry_id uuid,
  add column if not exists job_id uuid,
  add column if not exists description text,
  add column if not exists hours numeric(10,2),
  add column if not exists tonnes numeric(10,3) not null default 0,
  add column if not exists rate numeric(12,2) not null default 0,
  add column if not exists total numeric(12,2) not null default 0,
  add column if not exists work_date date,
  add column if not exists site_name text,
  add column if not exists created_at timestamptz not null default now();

update public.client_invoice_items
set
  tonnes = coalesce(tonnes, 0),
  rate = coalesce(rate, 0),
  total = coalesce(total, 0),
  created_at = coalesce(created_at, now())
where true;

create table if not exists public.project_participations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid,
  worker_id uuid,
  status text not null default 'requested',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.project_participations
  add column if not exists job_id uuid,
  add column if not exists worker_id uuid,
  add column if not exists status text not null default 'requested',
  add column if not exists scope_acknowledged_at timestamptz,
  add column if not exists induction_status text not null default 'pending',
  add column if not exists inducted_at timestamptz,
  add column if not exists notes text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.project_participations
set
  status = coalesce(status, 'requested'),
  induction_status = coalesce(induction_status, 'pending'),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where true;

alter table public.project_participations
  drop constraint if exists project_participations_status_check,
  add constraint project_participations_status_check
  check (status::text in ('requested', 'interested', 'confirmed', 'declined', 'completed')) not valid;

alter table public.project_participations
  drop constraint if exists project_participations_induction_status_check,
  add constraint project_participations_induction_status_check
  check (induction_status::text in ('pending', 'inducted')) not valid;

do $$
begin
  alter table public.project_participations
    add constraint project_participations_job_worker_unique unique (job_id, worker_id);
exception
  when duplicate_object then null;
  when unique_violation then
    raise notice 'project_participations has duplicate job_id/worker_id rows; unique constraint was not added.';
end $$;

create table if not exists public.project_notes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid,
  worker_id uuid,
  author_user_id uuid,
  note_type text not null default 'participation_note',
  body text not null default '',
  created_at timestamptz not null default now()
);

alter table public.project_notes
  add column if not exists job_id uuid,
  add column if not exists worker_id uuid,
  add column if not exists author_user_id uuid,
  add column if not exists note_type text not null default 'participation_note',
  add column if not exists body text not null default '',
  add column if not exists created_at timestamptz not null default now();

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid,
  certificate_type text,
  title text not null default 'Compliance document',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.certificates
  add column if not exists worker_id uuid,
  add column if not exists certificate_type text,
  add column if not exists title text,
  add column if not exists status text not null default 'active',
  add column if not exists issued_on date,
  add column if not exists expires_on date,
  add column if not exists storage_path text,
  add column if not exists file_name text,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.subcontractor_agreements (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid,
  created_at timestamptz not null default now()
);

alter table public.subcontractor_agreements
  add column if not exists worker_id uuid,
  add column if not exists auth_user_id uuid,
  add column if not exists full_name text,
  add column if not exists agreement_version text,
  add column if not exists acknowledged boolean not null default true,
  add column if not exists signature_data_url text,
  add column if not exists signed_at timestamptz,
  add column if not exists version text,
  add column if not exists signature_name text,
  add column if not exists profile_full_name text,
  add column if not exists signature_image_data_url text,
  add column if not exists user_id uuid,
  add column if not exists storage_path text,
  add column if not exists created_at timestamptz not null default now();

create table if not exists public.agreement_addendums (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid,
  title text not null default 'Contractor rate change',
  body text,
  status text not null default 'pending_worker_approval',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.agreement_addendums
  add column if not exists worker_id uuid,
  add column if not exists title text,
  add column if not exists body text,
  add column if not exists status text not null default 'pending_worker_approval',
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.rate_change_requests (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid,
  proposed_rate numeric(12,2) not null default 0,
  status text not null default 'pending_worker_approval',
  agreement_addendum_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rate_change_requests
  add column if not exists worker_id uuid,
  add column if not exists proposed_rate numeric(12,2) not null default 0,
  add column if not exists status text not null default 'pending_worker_approval',
  add column if not exists agreement_addendum_id uuid,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.worker_payment_details (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid,
  account_name text,
  bsb text,
  account_number text,
  remittance_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.worker_payment_details
  add column if not exists worker_id uuid,
  add column if not exists account_name text,
  add column if not exists bsb text,
  add column if not exists account_number text,
  add column if not exists remittance_email text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists clients_name_idx on public.clients(name);
create index if not exists clients_billing_email_idx on public.clients(billing_email);
create index if not exists workers_auth_user_id_idx on public.workers(auth_user_id);
create index if not exists workers_email_idx on public.workers(email);
create index if not exists workers_active_idx on public.workers(is_active);
create index if not exists jobs_project_status_idx on public.jobs(project_status);
create index if not exists jobs_status_idx on public.jobs(status);
create index if not exists jobs_client_id_idx on public.jobs(client_id);
create index if not exists work_entries_worker_date_idx on public.work_entries(worker_id, work_date);
create index if not exists work_entries_job_date_idx on public.work_entries(job_id, work_date);
create index if not exists work_entries_invoice_eligibility_idx on public.work_entries(job_id, work_date) where approved = true and locked = true;
create index if not exists worker_rates_worker_effective_idx on public.worker_rates(worker_id, effective_from desc);
create index if not exists client_rates_client_effective_idx on public.client_rates(client_id, effective_from desc);
create index if not exists worker_invoices_worker_period_idx on public.worker_invoices(worker_id, period_start, period_end);
create index if not exists worker_invoices_status_idx on public.worker_invoices(status, period_start desc);
create index if not exists worker_invoices_payment_status_idx on public.worker_invoices(payment_status, period_start desc);
create index if not exists worker_invoice_items_invoice_id_idx on public.worker_invoice_items(invoice_id);
create index if not exists worker_invoice_items_worker_invoice_id_idx on public.worker_invoice_items(worker_invoice_id);
create index if not exists worker_invoice_items_work_entry_id_idx on public.worker_invoice_items(work_entry_id);
create index if not exists worker_invoice_items_worker_id_idx on public.worker_invoice_items(worker_id);
create index if not exists client_invoices_client_period_idx on public.client_invoices(client_id, period_start, period_end);
create index if not exists client_invoices_payment_status_idx on public.client_invoices(payment_status, period_start desc);
create index if not exists client_invoice_items_invoice_idx on public.client_invoice_items(client_invoice_id);
create index if not exists client_invoice_items_work_entry_id_idx on public.client_invoice_items(work_entry_id);
create index if not exists client_invoice_items_job_id_idx on public.client_invoice_items(job_id);
create index if not exists project_participations_job_id_idx on public.project_participations(job_id);
create index if not exists project_participations_worker_id_idx on public.project_participations(worker_id);
create index if not exists project_participations_status_idx on public.project_participations(status);
create index if not exists project_participations_induction_status_idx on public.project_participations(induction_status);
create index if not exists certificates_worker_id_idx on public.certificates(worker_id);
create index if not exists rate_change_requests_worker_status_idx on public.rate_change_requests(worker_id, status);
create index if not exists worker_payment_details_worker_id_idx on public.worker_payment_details(worker_id);

drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at before update on public.clients
for each row execute function public.set_updated_at();

drop trigger if exists workers_set_updated_at on public.workers;
create trigger workers_set_updated_at before update on public.workers
for each row execute function public.set_updated_at();

drop trigger if exists jobs_set_updated_at on public.jobs;
create trigger jobs_set_updated_at before update on public.jobs
for each row execute function public.set_updated_at();

drop trigger if exists work_entries_set_updated_at on public.work_entries;
create trigger work_entries_set_updated_at before update on public.work_entries
for each row execute function public.set_updated_at();

drop trigger if exists worker_invoices_set_updated_at on public.worker_invoices;
create trigger worker_invoices_set_updated_at before update on public.worker_invoices
for each row execute function public.set_updated_at();

drop trigger if exists client_invoices_set_updated_at on public.client_invoices;
create trigger client_invoices_set_updated_at before update on public.client_invoices
for each row execute function public.set_updated_at();

drop trigger if exists project_participations_set_updated_at on public.project_participations;
create trigger project_participations_set_updated_at before update on public.project_participations
for each row execute function public.set_updated_at();

drop trigger if exists certificates_set_updated_at on public.certificates;
create trigger certificates_set_updated_at before update on public.certificates
for each row execute function public.set_updated_at();

drop trigger if exists agreement_addendums_set_updated_at on public.agreement_addendums;
create trigger agreement_addendums_set_updated_at before update on public.agreement_addendums
for each row execute function public.set_updated_at();

drop trigger if exists rate_change_requests_set_updated_at on public.rate_change_requests;
create trigger rate_change_requests_set_updated_at before update on public.rate_change_requests
for each row execute function public.set_updated_at();

drop trigger if exists worker_payment_details_set_updated_at on public.worker_payment_details;
create trigger worker_payment_details_set_updated_at before update on public.worker_payment_details
for each row execute function public.set_updated_at();

alter table public.clients enable row level security;
alter table public.workers enable row level security;
alter table public.jobs enable row level security;
alter table public.work_entries enable row level security;
alter table public.worker_rates enable row level security;
alter table public.client_rates enable row level security;
alter table public.worker_invoices enable row level security;
alter table public.worker_invoice_items enable row level security;
alter table public.client_invoices enable row level security;
alter table public.client_invoice_items enable row level security;
alter table public.project_participations enable row level security;
alter table public.project_notes enable row level security;
alter table public.certificates enable row level security;
alter table public.subcontractor_agreements enable row level security;
alter table public.agreement_addendums enable row level security;
alter table public.rate_change_requests enable row level security;
alter table public.worker_payment_details enable row level security;

drop policy if exists "clients admin all" on public.clients;
create policy "clients admin all" on public.clients
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "workers admin all" on public.workers;
create policy "workers admin all" on public.workers
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "workers own read update" on public.workers;
create policy "workers own read update" on public.workers
for all to authenticated
using (public.is_worker_auth(id))
with check (public.is_worker_auth(id));

drop policy if exists "jobs admin all" on public.jobs;
create policy "jobs admin all" on public.jobs
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "jobs participant read" on public.jobs;
create policy "jobs participant read" on public.jobs
for select to authenticated
using (
  exists (
    select 1
    from public.project_participations pp
    join public.workers w on w.id = pp.worker_id
    where pp.job_id = jobs.id
      and pp.status in ('confirmed', 'interested')
      and w.auth_user_id = auth.uid()
  )
);

drop policy if exists "work entries admin all" on public.work_entries;
create policy "work entries admin all" on public.work_entries
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "work entries worker own" on public.work_entries;
create policy "work entries worker own" on public.work_entries
for all to authenticated
using (public.is_worker_auth(worker_id))
with check (public.is_worker_auth(worker_id));

drop policy if exists "worker rates admin all" on public.worker_rates;
create policy "worker rates admin all" on public.worker_rates
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "worker rates self read" on public.worker_rates;
create policy "worker rates self read" on public.worker_rates
for select to authenticated using (public.is_worker_auth(worker_id));

drop policy if exists "client rates admin all" on public.client_rates;
create policy "client rates admin all" on public.client_rates
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "worker invoices admin all" on public.worker_invoices;
create policy "worker invoices admin all" on public.worker_invoices
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "worker invoices own read update" on public.worker_invoices;
create policy "worker invoices own read update" on public.worker_invoices
for all to authenticated
using (public.is_worker_auth(worker_id))
with check (public.is_worker_auth(worker_id));

drop policy if exists "worker invoice items admin all" on public.worker_invoice_items;
create policy "worker invoice items admin all" on public.worker_invoice_items
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "worker invoice items own read" on public.worker_invoice_items;
create policy "worker invoice items own read" on public.worker_invoice_items
for select to authenticated using (public.is_worker_auth(worker_id));

drop policy if exists "client invoices admin all" on public.client_invoices;
create policy "client invoices admin all" on public.client_invoices
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "client invoice items admin all" on public.client_invoice_items;
create policy "client invoice items admin all" on public.client_invoice_items
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "project participations admin all" on public.project_participations;
create policy "project participations admin all" on public.project_participations
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "project participations worker read" on public.project_participations;
create policy "project participations worker read" on public.project_participations
for select to authenticated using (public.is_worker_auth(worker_id));

drop policy if exists "project notes admin all" on public.project_notes;
create policy "project notes admin all" on public.project_notes
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "certificates admin all" on public.certificates;
create policy "certificates admin all" on public.certificates
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "certificates worker own" on public.certificates;
create policy "certificates worker own" on public.certificates
for all to authenticated
using (public.is_worker_auth(worker_id))
with check (public.is_worker_auth(worker_id));

drop policy if exists "agreements admin all" on public.subcontractor_agreements;
create policy "agreements admin all" on public.subcontractor_agreements
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "agreements worker own" on public.subcontractor_agreements;
create policy "agreements worker own" on public.subcontractor_agreements
for all to authenticated
using (public.is_worker_auth(worker_id) or auth_user_id = auth.uid())
with check (public.is_worker_auth(worker_id) or auth_user_id = auth.uid());

drop policy if exists "agreement addendums admin all" on public.agreement_addendums;
create policy "agreement addendums admin all" on public.agreement_addendums
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "agreement addendums worker read" on public.agreement_addendums;
create policy "agreement addendums worker read" on public.agreement_addendums
for select to authenticated using (public.is_worker_auth(worker_id));

drop policy if exists "rate change requests admin all" on public.rate_change_requests;
create policy "rate change requests admin all" on public.rate_change_requests
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "rate change requests worker read" on public.rate_change_requests;
create policy "rate change requests worker read" on public.rate_change_requests
for select to authenticated using (public.is_worker_auth(worker_id));

drop policy if exists "worker payment details admin all" on public.worker_payment_details;
create policy "worker payment details admin all" on public.worker_payment_details
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "worker payment details own read" on public.worker_payment_details;
create policy "worker payment details own read" on public.worker_payment_details
for select to authenticated using (public.is_worker_auth(worker_id));

notify pgrst, 'reload schema';
