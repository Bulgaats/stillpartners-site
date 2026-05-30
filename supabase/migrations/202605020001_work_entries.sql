-- Work entries for the production jobs/workers/assignments system.
-- One logical entry per worker/job/date. Tonnes are calculated internally as hours / 10.

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

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.work_entries (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  assignment_id uuid references public.assignments(id) on delete set null,
  work_date date not null,
  hours numeric(8, 2) not null default 0 check (hours >= 0 and hours <= 24),
  tonnes numeric(10, 3) generated always as (round((hours / 10.0), 3)) stored,
  entered_by uuid,
  entry_role text not null default 'admin',
  approved boolean not null default false,
  approved_by uuid,
  approved_at timestamptz,
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.work_entries
add column if not exists worker_id uuid references public.workers(id) on delete cascade,
add column if not exists job_id uuid references public.jobs(id) on delete cascade,
add column if not exists assignment_id uuid references public.assignments(id) on delete set null,
add column if not exists work_date date,
add column if not exists hours numeric(8, 2) not null default 0,
add column if not exists entered_by uuid,
add column if not exists entry_role text not null default 'admin',
add column if not exists approved boolean not null default false,
add column if not exists approved_by uuid,
add column if not exists approved_at timestamptz,
add column if not exists locked boolean not null default false,
add column if not exists created_at timestamptz not null default now(),
add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'work_entries'
      and column_name = 'tonnes'
  ) then
    alter table public.work_entries
    add column tonnes numeric(10, 3) generated always as (round((hours / 10.0), 3)) stored;
  end if;
end;
$$;

update public.work_entries
set
  hours = coalesce(hours, 0),
  entry_role = coalesce(entry_role, 'admin'),
  approved = coalesce(approved, false),
  locked = coalesce(locked, false),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.work_entries
alter column worker_id set not null,
alter column job_id set not null,
alter column work_date set not null,
alter column hours set default 0,
alter column hours set not null,
alter column entry_role set default 'admin',
alter column entry_role set not null,
alter column approved set default false,
alter column approved set not null,
alter column locked set default false,
alter column locked set not null,
alter column created_at set default now(),
alter column created_at set not null,
alter column updated_at set default now(),
alter column updated_at set not null;

alter table public.work_entries
drop constraint if exists work_entries_hours_check,
add constraint work_entries_hours_check check (hours >= 0 and hours <= 24) not valid;

alter table public.work_entries
drop constraint if exists work_entries_entry_role_check,
add constraint work_entries_entry_role_check
check (entry_role in ('admin', 'leading_hand', 'worker')) not valid;

drop trigger if exists work_entries_set_updated_at on public.work_entries;
create trigger work_entries_set_updated_at
before update on public.work_entries
for each row
execute function public.set_updated_at();

alter table public.work_entries enable row level security;

drop policy if exists "work entries admin all" on public.work_entries;
create policy "work entries admin all"
on public.work_entries
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "work entries worker own read" on public.work_entries;
create policy "work entries worker own read"
on public.work_entries
for select
to authenticated
using (worker_id = auth.uid() or public.is_admin());

drop policy if exists "work entries worker own insert" on public.work_entries;
create policy "work entries worker own insert"
on public.work_entries
for insert
to authenticated
with check (
  worker_id = auth.uid()
  and entry_role = 'worker'
  and approved = false
  and locked = false
);

drop policy if exists "work entries worker own update unlocked" on public.work_entries;
create policy "work entries worker own update unlocked"
on public.work_entries
for update
to authenticated
using (worker_id = auth.uid() and approved = false and locked = false)
with check (worker_id = auth.uid() and approved = false and locked = false);

drop policy if exists "work entries leading hand crew read" on public.work_entries;
create policy "work entries leading hand crew read"
on public.work_entries
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.assignments lead_assignment
    where lead_assignment.job_id = work_entries.job_id
      and lead_assignment.date = work_entries.work_date
      and lead_assignment.worker_id = auth.uid()
      and lead_assignment.role = 'leading_hand'
  )
);

drop policy if exists "work entries leading hand crew insert" on public.work_entries;
create policy "work entries leading hand crew insert"
on public.work_entries
for insert
to authenticated
with check (
  entry_role = 'leading_hand'
  and approved = false
  and locked = false
  and exists (
    select 1
    from public.assignments lead_assignment
    where lead_assignment.job_id = work_entries.job_id
      and lead_assignment.date = work_entries.work_date
      and lead_assignment.worker_id = auth.uid()
      and lead_assignment.role = 'leading_hand'
  )
  and exists (
    select 1
    from public.assignments crew_assignment
    where crew_assignment.job_id = work_entries.job_id
      and crew_assignment.date = work_entries.work_date
      and crew_assignment.worker_id = work_entries.worker_id
  )
);

drop policy if exists "work entries leading hand crew update unlocked" on public.work_entries;
create policy "work entries leading hand crew update unlocked"
on public.work_entries
for update
to authenticated
using (
  approved = false
  and locked = false
  and exists (
    select 1
    from public.assignments lead_assignment
    where lead_assignment.job_id = work_entries.job_id
      and lead_assignment.date = work_entries.work_date
      and lead_assignment.worker_id = auth.uid()
      and lead_assignment.role = 'leading_hand'
  )
)
with check (
  approved = false
  and locked = false
  and exists (
    select 1
    from public.assignments lead_assignment
    where lead_assignment.job_id = work_entries.job_id
      and lead_assignment.date = work_entries.work_date
      and lead_assignment.worker_id = auth.uid()
      and lead_assignment.role = 'leading_hand'
  )
  and exists (
    select 1
    from public.assignments crew_assignment
    where crew_assignment.job_id = work_entries.job_id
      and crew_assignment.date = work_entries.work_date
      and crew_assignment.worker_id = work_entries.worker_id
  )
);

grant select, insert, update, delete on public.work_entries to authenticated;

create unique index if not exists work_entries_worker_job_date_uidx
on public.work_entries(worker_id, job_id, work_date);

create index if not exists work_entries_worker_id_idx on public.work_entries(worker_id);
create index if not exists work_entries_job_id_idx on public.work_entries(job_id);
create index if not exists work_entries_assignment_id_idx on public.work_entries(assignment_id);
create index if not exists work_entries_work_date_idx on public.work_entries(work_date);
create index if not exists work_entries_approved_locked_idx
on public.work_entries(approved, locked);

comment on policy "work entries worker own read" on public.work_entries is
'Worker access assumes workers.id matches auth.uid(). If workers are later linked through profiles, update this policy to use that mapping.';

comment on policy "work entries leading hand crew insert" on public.work_entries is
'Daily leading hand access assumes assignments.worker_id matches auth.uid() for authenticated worker accounts.';

notify pgrst, 'reload schema';
