-- Simple production job and daily assignment system.
-- Safe to run alongside the existing beta dashboard schema.

create extension if not exists pgcrypto;

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

grant execute on function public.is_admin() to authenticated;

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  site_name text,
  client_company text,
  location text,
  start_date date,
  end_date date,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

alter table public.jobs
add column if not exists site_name text,
add column if not exists client_company text,
add column if not exists location text,
add column if not exists start_date date,
add column if not exists end_date date,
add column if not exists status text not null default 'active',
add column if not exists created_at timestamptz not null default now();

alter table public.jobs
drop constraint if exists jobs_status_check,
add constraint jobs_status_check
check (status::text in ('active', 'completed', 'scheduled')) not valid;

create table if not exists public.workers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  trade text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.workers
add column if not exists full_name text,
add column if not exists phone text,
add column if not exists trade text,
add column if not exists is_active boolean not null default true,
add column if not exists created_at timestamptz not null default now();

update public.workers
set
  full_name = coalesce(full_name, 'Unnamed worker'),
  is_active = coalesce(is_active, true),
  created_at = coalesce(created_at, now());

alter table public.workers
alter column full_name set not null,
alter column is_active set default true,
alter column is_active set not null,
alter column created_at set default now(),
alter column created_at set not null;

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  date date not null,
  start_time time not null,
  role text not null default 'worker',
  created_at timestamptz not null default now()
);

alter table public.assignments
add column if not exists job_id uuid references public.jobs(id) on delete cascade,
add column if not exists worker_id uuid references public.workers(id) on delete cascade,
add column if not exists date date,
add column if not exists start_time time,
add column if not exists role text not null default 'worker',
add column if not exists created_at timestamptz not null default now();

alter table public.assignments
drop constraint if exists assignments_role_check,
add constraint assignments_role_check
check (role in ('worker', 'leading_hand')) not valid;

alter table public.jobs enable row level security;
alter table public.workers enable row level security;
alter table public.assignments enable row level security;

drop policy if exists "jobs admin all" on public.jobs;
create policy "jobs admin all"
on public.jobs
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "workers admin all" on public.workers;
create policy "workers admin all"
on public.workers
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "workers self read" on public.workers;
create policy "workers self read"
on public.workers
for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "assignments admin all" on public.assignments;
create policy "assignments admin all"
on public.assignments
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "assignments worker own read" on public.assignments;
create policy "assignments worker own read"
on public.assignments
for select
to authenticated
using (worker_id = auth.uid() or public.is_admin());

grant select, insert, update, delete on public.jobs to authenticated;
grant select, insert, update, delete on public.workers to authenticated;
grant select, insert, update, delete on public.assignments to authenticated;

create index if not exists jobs_status_idx on public.jobs(status);
create index if not exists jobs_start_date_idx on public.jobs(start_date);
create index if not exists workers_active_idx on public.workers(is_active);
create index if not exists workers_trade_idx on public.workers(trade);
create index if not exists assignments_job_id_idx on public.assignments(job_id);
create index if not exists assignments_worker_id_idx on public.assignments(worker_id);
create index if not exists assignments_date_idx on public.assignments(date);
create unique index if not exists assignments_job_worker_date_role_idx
on public.assignments(job_id, worker_id, date, role);

notify pgrst, 'reload schema';
