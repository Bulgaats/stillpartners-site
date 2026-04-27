create extension if not exists "pgcrypto";

create type public.app_role as enum ('worker', 'leading_hand', 'admin');
create type public.document_status as enum ('pending', 'approved', 'rejected', 'expired');
create type public.job_status as enum ('draft', 'scheduled', 'active', 'completed', 'cancelled');
create type public.assignment_status as enum ('scheduled', 'confirmed', 'completed', 'cancelled');
create type public.hours_status as enum ('draft', 'submitted', 'approved', 'rejected', 'invoiced');
create type public.correction_status as enum ('requested', 'approved', 'rejected', 'applied');
create type public.invoice_type as enum ('worker', 'client');
create type public.invoice_status as enum ('draft', 'pending', 'sent', 'paid', 'void');
create type public.payment_status as enum ('pending', 'part_paid', 'paid', 'failed');
create type public.rate_kind as enum ('hourly', 'tonne');
create type public.rate_approval_status as enum ('pending_worker_approval', 'approved', 'rejected', 'superseded');
create type public.rate_decision as enum ('approved', 'rejected');
create type public.expense_frequency as enum ('weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly');
create type public.lead_status as enum ('new', 'contacted', 'qualified', 'converted', 'archived');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'worker',
  full_name text not null default '',
  phone text,
  abn text,
  tax_residency_country text not null default 'Australia',
  address_line_1 text,
  address_line_2 text,
  suburb text,
  state text default 'WA',
  postcode text,
  emergency_contact_name text,
  emergency_contact_phone text,
  agreement_signed_at timestamptz,
  agreement_version text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.worker_payment_details (
  worker_id uuid primary key references public.profiles(id) on delete cascade,
  account_name text not null,
  bsb text not null,
  account_number text not null,
  remittance_email text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint worker_payment_details_bsb_check check (bsb ~ '^[0-9]{3}-?[0-9]{3}$')
);

create table public.public_subcontractor_leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  trade text not null,
  abn text,
  has_white_card boolean,
  message text,
  status public.lead_status not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.public_client_leads (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text not null,
  email text not null,
  phone text,
  required_trades text,
  project_location text,
  message text,
  status public.lead_status not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  subject text,
  message text not null,
  status public.lead_status not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  abn text,
  billing_email text,
  phone text,
  address text,
  payment_terms_days integer not null default 14,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  address text not null,
  suburb text,
  state text not null default 'WA',
  postcode text,
  site_contact_name text,
  site_contact_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  site_id uuid references public.sites(id) on delete set null,
  title text not null,
  trade text not null,
  starts_on date not null,
  ends_on date,
  start_time time,
  status public.job_status not null default 'draft',
  leading_hand_id uuid references public.profiles(id) on delete set null,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_date_order check (ends_on is null or ends_on >= starts_on)
);

create table public.job_assignments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  worker_id uuid not null references public.profiles(id) on delete cascade,
  leading_hand_id uuid references public.profiles(id) on delete set null,
  starts_on date not null,
  ends_on date,
  start_time time,
  status public.assignment_status not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, worker_id),
  constraint job_assignments_date_order check (ends_on is null or ends_on >= starts_on)
);

create table public.leading_hand_workers (
  id uuid primary key default gen_random_uuid(),
  leading_hand_id uuid not null references public.profiles(id) on delete cascade,
  worker_id uuid not null references public.profiles(id) on delete cascade,
  starts_on date not null default current_date,
  ends_on date,
  created_at timestamptz not null default now(),
  unique (leading_hand_id, worker_id, starts_on),
  constraint leading_hand_workers_date_order check (ends_on is null or ends_on >= starts_on)
);

create table public.subcontractor_agreements (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.profiles(id) on delete cascade,
  version text not null,
  signed_at timestamptz not null default now(),
  signature_name text not null,
  signature_ip inet,
  storage_path text,
  created_at timestamptz not null default now()
);

create table public.worker_documents (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.profiles(id) on delete cascade,
  document_type text not null,
  title text not null,
  issuer text,
  issued_on date,
  expires_on date,
  status public.document_status not null default 'pending',
  storage_path text not null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.worker_rates (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.profiles(id) on delete cascade,
  trade text not null,
  kind public.rate_kind not null default 'hourly',
  pay_rate numeric(12, 2) not null check (pay_rate >= 0),
  approval_status public.rate_approval_status not null default 'pending_worker_approval',
  approved_by_worker_at timestamptz,
  rejected_by_worker_at timestamptz,
  worker_rejection_reason text,
  effective_from date not null,
  effective_to date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint worker_rates_date_order check (effective_to is null or effective_to >= effective_from)
);

create table public.contract_addendums (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.profiles(id) on delete cascade,
  worker_rate_id uuid not null references public.worker_rates(id) on delete cascade,
  version text not null,
  addendum_text text not null,
  signed_at timestamptz,
  signature_name text,
  signature_ip inet,
  storage_path text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.worker_rate_decisions (
  id uuid primary key default gen_random_uuid(),
  worker_rate_id uuid not null references public.worker_rates(id) on delete cascade,
  worker_id uuid not null references public.profiles(id) on delete cascade,
  decision public.rate_decision not null,
  signature_name text,
  signature_ip inet,
  reason text,
  created_at timestamptz not null default now(),
  unique (worker_rate_id, worker_id)
);

create table public.client_rates (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  trade text not null,
  kind public.rate_kind not null default 'hourly',
  charge_rate numeric(12, 2) not null check (charge_rate >= 0),
  effective_from date not null,
  effective_to date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint client_rates_date_order check (effective_to is null or effective_to >= effective_from)
);

create table public.daily_hours (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  worker_id uuid not null references public.profiles(id) on delete cascade,
  submitted_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  work_date date not null,
  hours numeric(6, 2) not null check (hours >= 0 and hours <= 24),
  tonnes numeric(8, 3) generated always as (round((hours / 10.0), 3)) stored,
  break_minutes integer not null default 0 check (break_minutes >= 0),
  notes text,
  status public.hours_status not null default 'submitted',
  submitted_at timestamptz,
  is_locked boolean not null default false,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, worker_id, work_date)
);

create table public.timesheet_correction_requests (
  id uuid primary key default gen_random_uuid(),
  daily_hours_id uuid not null references public.daily_hours(id) on delete cascade,
  worker_id uuid not null references public.profiles(id) on delete cascade,
  requested_hours numeric(6, 2) check (requested_hours >= 0 and requested_hours <= 24),
  requested_break_minutes integer check (requested_break_minutes is null or requested_break_minutes >= 0),
  reason text not null,
  status public.correction_status not null default 'requested',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_type public.invoice_type not null,
  invoice_number text unique,
  worker_id uuid references public.profiles(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  period_start date not null,
  period_end date not null,
  status public.invoice_status not null default 'draft',
  subtotal numeric(12, 2) not null default 0,
  gst numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  gst_treatment text not null default 'standard',
  reply_to_email text,
  storage_path text,
  generated_by uuid references public.profiles(id) on delete set null,
  generated_at timestamptz,
  due_on date,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoice_party_check check (worker_id is not null or client_id is not null),
  constraint invoice_type_party_check check (
    (invoice_type = 'worker' and worker_id is not null and client_id is null)
    or (invoice_type = 'client' and client_id is not null and worker_id is null)
  ),
  constraint invoice_period_order check (period_end >= period_start)
);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  daily_hours_id uuid references public.daily_hours(id) on delete set null,
  description text not null,
  quantity numeric(10, 3) not null check (quantity >= 0),
  unit_rate numeric(12, 2) not null check (unit_rate >= 0),
  amount numeric(12, 2) generated always as (round((quantity * unit_rate), 2)) stored,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount numeric(12, 2) not null check (amount >= 0),
  status public.payment_status not null default 'pending',
  paid_on date,
  reference text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  frequency public.expense_frequency not null,
  starts_on date not null,
  ends_on date,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_expenses_date_order check (ends_on is null or ends_on >= starts_on)
);

create table public.expense_entries (
  id uuid primary key default gen_random_uuid(),
  recurring_expense_id uuid references public.recurring_expenses(id) on delete set null,
  name text not null,
  category text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  expense_date date not null,
  receipt_storage_path text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger worker_payment_details_updated_at before update on public.worker_payment_details
for each row execute function public.set_updated_at();
create trigger public_subcontractor_leads_updated_at before update on public.public_subcontractor_leads
for each row execute function public.set_updated_at();
create trigger public_client_leads_updated_at before update on public.public_client_leads
for each row execute function public.set_updated_at();
create trigger contact_messages_updated_at before update on public.contact_messages
for each row execute function public.set_updated_at();
create trigger clients_updated_at before update on public.clients
for each row execute function public.set_updated_at();
create trigger sites_updated_at before update on public.sites
for each row execute function public.set_updated_at();
create trigger jobs_updated_at before update on public.jobs
for each row execute function public.set_updated_at();
create trigger job_assignments_updated_at before update on public.job_assignments
for each row execute function public.set_updated_at();
create trigger worker_documents_updated_at before update on public.worker_documents
for each row execute function public.set_updated_at();
create trigger daily_hours_updated_at before update on public.daily_hours
for each row execute function public.set_updated_at();
create trigger timesheet_correction_requests_updated_at before update on public.timesheet_correction_requests
for each row execute function public.set_updated_at();
create trigger invoices_updated_at before update on public.invoices
for each row execute function public.set_updated_at();
create trigger recurring_expenses_updated_at before update on public.recurring_expenses
for each row execute function public.set_updated_at();

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'admin', false);
$$;

create or replace function public.is_leading_hand_for_worker(target_worker_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.leading_hand_workers lhw
    where lhw.leading_hand_id = auth.uid()
      and lhw.worker_id = target_worker_id
      and lhw.starts_on <= current_date
      and (lhw.ends_on is null or lhw.ends_on >= current_date)
  );
$$;

create or replace function public.can_access_job(target_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.jobs j
    where j.id = target_job_id
      and (
        j.leading_hand_id = auth.uid()
        or exists (
          select 1 from public.job_assignments ja
          where ja.job_id = target_job_id
            and (ja.worker_id = auth.uid() or ja.leading_hand_id = auth.uid())
        )
      )
  );
$$;

create or replace function public.prepare_daily_hours_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.is_locked and not public.is_admin() then
    raise exception 'Approved timesheets are locked';
  end if;

  if new.status in ('approved', 'invoiced') then
    new.is_locked = true;
    if new.approved_at is null then
      new.approved_at = now();
    end if;
  end if;

  if new.status = 'submitted' and new.submitted_at is null then
    new.submitted_at = now();
  end if;

  return new;
end;
$$;

create trigger daily_hours_prepare_write
before insert or update on public.daily_hours
for each row execute function public.prepare_daily_hours_write();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'worker'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace view public.profit_dashboard as
with monthly_hours as (
  select
    date_trunc('month', work_date)::date as month,
    sum(hours)::numeric(12, 2) as approved_hours,
    sum(tonnes)::numeric(12, 3) as tonnes
  from public.daily_hours
  where status in ('approved', 'invoiced')
  group by date_trunc('month', work_date)
),
monthly_invoice_lines as (
  select
    date_trunc('month', inv.period_start)::date as month,
    sum(il.amount) filter (where inv.client_id is not null)::numeric(12, 2) as client_revenue,
    sum(il.amount) filter (where inv.worker_id is not null)::numeric(12, 2) as worker_cost
  from public.invoice_lines il
  join public.invoices inv on inv.id = il.invoice_id
  where inv.status <> 'void'
  group by date_trunc('month', inv.period_start)
),
monthly_expenses as (
  select
    date_trunc('month', expense_date)::date as month,
    sum(amount)::numeric(12, 2) as expenses
  from public.expense_entries
  group by date_trunc('month', expense_date)
),
months as (
  select month from monthly_hours
  union
  select month from monthly_invoice_lines
  union
  select month from monthly_expenses
)
select
  months.month,
  coalesce(monthly_invoice_lines.client_revenue, 0)::numeric(12, 2) as client_revenue,
  coalesce(monthly_invoice_lines.worker_cost, 0)::numeric(12, 2) as worker_cost,
  coalesce(monthly_expenses.expenses, 0)::numeric(12, 2) as expenses,
  coalesce(monthly_hours.approved_hours, 0)::numeric(12, 2) as approved_hours,
  coalesce(monthly_hours.tonnes, 0)::numeric(12, 3) as tonnes,
  (
    coalesce(monthly_invoice_lines.client_revenue, 0)
    - coalesce(monthly_invoice_lines.worker_cost, 0)
    - coalesce(monthly_expenses.expenses, 0)
  )::numeric(12, 2) as gross_profit
from months
left join monthly_hours using (month)
left join monthly_invoice_lines using (month)
left join monthly_expenses using (month)
where public.is_admin();

alter view public.profit_dashboard set (security_invoker = true);

alter table public.profiles enable row level security;
alter table public.worker_payment_details enable row level security;
alter table public.public_subcontractor_leads enable row level security;
alter table public.public_client_leads enable row level security;
alter table public.contact_messages enable row level security;
alter table public.clients enable row level security;
alter table public.sites enable row level security;
alter table public.jobs enable row level security;
alter table public.job_assignments enable row level security;
alter table public.leading_hand_workers enable row level security;
alter table public.subcontractor_agreements enable row level security;
alter table public.worker_documents enable row level security;
alter table public.worker_rates enable row level security;
alter table public.contract_addendums enable row level security;
alter table public.worker_rate_decisions enable row level security;
alter table public.client_rates enable row level security;
alter table public.daily_hours enable row level security;
alter table public.timesheet_correction_requests enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.payments enable row level security;
alter table public.recurring_expenses enable row level security;
alter table public.expense_entries enable row level security;

create policy "profiles self read" on public.profiles
for select using (id = auth.uid() or public.is_admin() or public.is_leading_hand_for_worker(id));
create policy "profiles self update" on public.profiles
for update using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());
create policy "profiles admin insert" on public.profiles
for insert with check (public.is_admin());

create policy "payment details admin all" on public.worker_payment_details
for all using (public.is_admin()) with check (public.is_admin());
create policy "payment details worker own read" on public.worker_payment_details
for select using (worker_id = auth.uid() or public.is_admin());
create policy "payment details worker own upsert" on public.worker_payment_details
for insert with check (worker_id = auth.uid());
create policy "payment details worker own update" on public.worker_payment_details
for update using (worker_id = auth.uid()) with check (worker_id = auth.uid());

create policy "subcontractor leads public insert" on public.public_subcontractor_leads
for insert to anon, authenticated with check (true);
create policy "subcontractor leads admin all" on public.public_subcontractor_leads
for all using (public.is_admin()) with check (public.is_admin());

create policy "client leads public insert" on public.public_client_leads
for insert to anon, authenticated with check (true);
create policy "client leads admin all" on public.public_client_leads
for all using (public.is_admin()) with check (public.is_admin());

create policy "contact messages public insert" on public.contact_messages
for insert to anon, authenticated with check (true);
create policy "contact messages admin all" on public.contact_messages
for all using (public.is_admin()) with check (public.is_admin());

create policy "clients admin all" on public.clients
for all using (public.is_admin()) with check (public.is_admin());
create policy "clients crew read assigned" on public.clients
for select using (
  public.is_admin()
  or exists (
    select 1 from public.jobs j
    left join public.job_assignments ja on ja.job_id = j.id
    where j.client_id = clients.id
      and (j.leading_hand_id = auth.uid() or ja.worker_id = auth.uid() or ja.leading_hand_id = auth.uid())
  )
);

create policy "sites admin all" on public.sites
for all using (public.is_admin()) with check (public.is_admin());
create policy "sites crew read assigned" on public.sites
for select using (
  public.is_admin()
  or exists (
    select 1 from public.jobs j
    left join public.job_assignments ja on ja.job_id = j.id
    where j.site_id = sites.id
      and (j.leading_hand_id = auth.uid() or ja.worker_id = auth.uid() or ja.leading_hand_id = auth.uid())
  )
);

create policy "jobs admin all" on public.jobs
for all using (public.is_admin()) with check (public.is_admin());
create policy "jobs assigned read" on public.jobs
for select using (public.is_admin() or public.can_access_job(id));

create policy "job assignments admin all" on public.job_assignments
for all using (public.is_admin()) with check (public.is_admin());
create policy "job assignments crew read" on public.job_assignments
for select using (
  public.is_admin()
  or worker_id = auth.uid()
  or leading_hand_id = auth.uid()
  or public.is_leading_hand_for_worker(worker_id)
);

create policy "leading hand workers admin all" on public.leading_hand_workers
for all using (public.is_admin()) with check (public.is_admin());
create policy "leading hand workers read own crew" on public.leading_hand_workers
for select using (
  public.is_admin()
  or leading_hand_id = auth.uid()
  or worker_id = auth.uid()
);

create policy "agreements admin all" on public.subcontractor_agreements
for all using (public.is_admin()) with check (public.is_admin());
create policy "agreements worker read own" on public.subcontractor_agreements
for select using (worker_id = auth.uid() or public.is_leading_hand_for_worker(worker_id) or public.is_admin());
create policy "agreements worker insert own" on public.subcontractor_agreements
for insert with check (worker_id = auth.uid());

create policy "documents admin all" on public.worker_documents
for all using (public.is_admin()) with check (public.is_admin());
create policy "documents crew read" on public.worker_documents
for select using (worker_id = auth.uid() or public.is_leading_hand_for_worker(worker_id) or public.is_admin());
create policy "documents worker insert own" on public.worker_documents
for insert with check (worker_id = auth.uid());
create policy "documents worker update own pending" on public.worker_documents
for update using (worker_id = auth.uid() and status = 'pending')
with check (worker_id = auth.uid());

create policy "worker rates admin all" on public.worker_rates
for all using (public.is_admin()) with check (public.is_admin());
create policy "worker rates self read" on public.worker_rates
for select using (worker_id = auth.uid() or public.is_admin());

create policy "contract addendums admin all" on public.contract_addendums
for all using (public.is_admin()) with check (public.is_admin());
create policy "contract addendums worker read own" on public.contract_addendums
for select using (worker_id = auth.uid() or public.is_admin());

create policy "rate decisions admin all" on public.worker_rate_decisions
for all using (public.is_admin()) with check (public.is_admin());
create policy "rate decisions worker insert own" on public.worker_rate_decisions
for insert with check (
  worker_id = auth.uid()
  and exists (
    select 1 from public.worker_rates wr
    where wr.id = worker_rate_decisions.worker_rate_id
      and wr.worker_id = auth.uid()
      and wr.approval_status = 'pending_worker_approval'
  )
);
create policy "rate decisions worker read own" on public.worker_rate_decisions
for select using (worker_id = auth.uid() or public.is_admin());

create policy "client rates admin all" on public.client_rates
for all using (public.is_admin()) with check (public.is_admin());

create policy "daily hours admin all" on public.daily_hours
for all using (public.is_admin()) with check (public.is_admin());
create policy "daily hours crew read" on public.daily_hours
for select using (
  worker_id = auth.uid()
  or submitted_by = auth.uid()
  or public.is_leading_hand_for_worker(worker_id)
  or public.is_admin()
);
create policy "daily hours worker or leading hand insert" on public.daily_hours
for insert with check (
  submitted_by = auth.uid()
  and (
    worker_id = auth.uid()
    or public.is_leading_hand_for_worker(worker_id)
  )
);
create policy "daily hours submitter update before approval" on public.daily_hours
for update using (
  status in ('draft', 'submitted')
  and is_locked = false
  and (
    submitted_by = auth.uid()
    or worker_id = auth.uid()
    or public.is_leading_hand_for_worker(worker_id)
  )
) with check (
  status in ('draft', 'submitted')
  and is_locked = false
  and (
    submitted_by = auth.uid()
    or worker_id = auth.uid()
    or public.is_leading_hand_for_worker(worker_id)
  )
);

create policy "corrections admin all" on public.timesheet_correction_requests
for all using (public.is_admin()) with check (public.is_admin());
create policy "corrections worker create own" on public.timesheet_correction_requests
for insert with check (
  worker_id = auth.uid()
  and exists (
    select 1 from public.daily_hours dh
    where dh.id = timesheet_correction_requests.daily_hours_id
      and dh.worker_id = auth.uid()
  )
);
create policy "corrections worker read own" on public.timesheet_correction_requests
for select using (
  worker_id = auth.uid()
  or public.is_leading_hand_for_worker(worker_id)
  or public.is_admin()
);

create policy "invoices admin all" on public.invoices
for all using (public.is_admin()) with check (public.is_admin());
create policy "invoices worker read own" on public.invoices
for select using (worker_id = auth.uid() or public.is_admin());

create policy "invoice lines admin all" on public.invoice_lines
for all using (public.is_admin()) with check (public.is_admin());
create policy "invoice lines worker read own invoice" on public.invoice_lines
for select using (
  exists (
    select 1 from public.invoices inv
    where inv.id = invoice_lines.invoice_id
      and (inv.worker_id = auth.uid() or public.is_admin())
  )
);

create policy "payments admin all" on public.payments
for all using (public.is_admin()) with check (public.is_admin());
create policy "payments worker read own invoice" on public.payments
for select using (
  exists (
    select 1 from public.invoices inv
    where inv.id = payments.invoice_id
      and inv.worker_id = auth.uid()
  )
  or public.is_admin()
);

create policy "recurring expenses admin all" on public.recurring_expenses
for all using (public.is_admin()) with check (public.is_admin());

create policy "expense entries admin all" on public.expense_entries
for all using (public.is_admin()) with check (public.is_admin());

grant insert on public.public_subcontractor_leads to anon, authenticated;
grant insert on public.public_client_leads to anon, authenticated;
grant insert on public.contact_messages to anon, authenticated;

insert into storage.buckets (id, name, public)
values
  ('certificates', 'certificates', false),
  ('agreements', 'agreements', false),
  ('invoices', 'invoices', false)
on conflict (id) do nothing;

create policy "certificate files admin all" on storage.objects
for all using (bucket_id = 'certificates' and public.is_admin())
with check (bucket_id = 'certificates' and public.is_admin());
create policy "certificate files worker own folder" on storage.objects
for insert with check (
  bucket_id = 'certificates'
  and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "certificate files owner read" on storage.objects
for select using (
  bucket_id = 'certificates'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

create policy "agreement files admin all" on storage.objects
for all using (bucket_id = 'agreements' and public.is_admin())
with check (bucket_id = 'agreements' and public.is_admin());
create policy "agreement files worker own folder" on storage.objects
for insert with check (
  bucket_id = 'agreements'
  and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "agreement files owner read" on storage.objects
for select using (
  bucket_id = 'agreements'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

create policy "invoice files admin all" on storage.objects
for all using (bucket_id = 'invoices' and public.is_admin())
with check (bucket_id = 'invoices' and public.is_admin());
create policy "invoice files worker read own folder" on storage.objects
for select using (
  bucket_id = 'invoices'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

create index profiles_role_idx on public.profiles(role);
create index public_subcontractor_leads_status_idx on public.public_subcontractor_leads(status, created_at);
create index public_client_leads_status_idx on public.public_client_leads(status, created_at);
create index contact_messages_status_idx on public.contact_messages(status, created_at);
create index jobs_client_id_idx on public.jobs(client_id);
create index jobs_leading_hand_id_idx on public.jobs(leading_hand_id);
create index job_assignments_worker_id_idx on public.job_assignments(worker_id);
create index leading_hand_workers_leading_hand_id_idx on public.leading_hand_workers(leading_hand_id);
create index worker_documents_worker_id_idx on public.worker_documents(worker_id);
create index worker_rates_worker_id_idx on public.worker_rates(worker_id, effective_from);
create index worker_rate_decisions_worker_rate_id_idx on public.worker_rate_decisions(worker_rate_id);
create index daily_hours_worker_date_idx on public.daily_hours(worker_id, work_date);
create index daily_hours_job_date_idx on public.daily_hours(job_id, work_date);
create index timesheet_correction_requests_daily_hours_id_idx on public.timesheet_correction_requests(daily_hours_id);
create index invoices_worker_id_idx on public.invoices(worker_id);
create index invoices_client_id_idx on public.invoices(client_id);
create index invoices_type_status_idx on public.invoices(invoice_type, status, period_start);
