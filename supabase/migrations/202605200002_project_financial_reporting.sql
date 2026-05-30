-- Add lightweight project progress fields for admin financial reporting.
-- This migration is additive and safe to run more than once.

alter table if exists public.jobs
  add column if not exists completion_percent numeric(5,2) not null default 0,
  add column if not exists archived_at timestamptz;

alter table if exists public.jobs
  add column if not exists project_status text not null default 'planned';

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'jobs'
      and constraint_name = 'jobs_project_status_check'
  ) then
    alter table public.jobs drop constraint jobs_project_status_check;
  end if;
end $$;

alter table if exists public.jobs
  add constraint jobs_project_status_check
  check (project_status in ('planned', 'active', 'nearing_completion', 'completed', 'archived'));

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'jobs'
      and constraint_name = 'jobs_completion_percent_check'
  ) then
    alter table public.jobs drop constraint jobs_completion_percent_check;
  end if;
end $$;

alter table if exists public.jobs
  add constraint jobs_completion_percent_check
  check (completion_percent >= 0 and completion_percent <= 100);

create index if not exists jobs_project_status_idx
  on public.jobs (project_status);

create index if not exists jobs_completion_percent_idx
  on public.jobs (completion_percent);

notify pgrst, 'reload schema';
