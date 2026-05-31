-- Still Partners date-based project participation requests.
-- Source-control record only until migration history is baselined/repaired.

create table if not exists public.project_participation_requests (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  participation_date date not null,
  site_access_time time,
  scope_note text,
  status text not null default 'proposed'
    check (status in ('proposed', 'contractor_confirmed', 'unable_to_participate', 'withdrawn')),
  confirmation_source text
    check (confirmation_source is null or confirmation_source in ('contractor_app', 'admin_recorded_verbal')),
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete set null,
  project_lead_worker_id uuid references public.workers(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists project_participation_requests_job_worker_date_uidx
  on public.project_participation_requests(job_id, worker_id, participation_date);

create unique index if not exists project_participation_requests_worker_confirmed_date_uidx
  on public.project_participation_requests(worker_id, participation_date)
  where status = 'contractor_confirmed';

create index if not exists project_participation_requests_job_date_idx
  on public.project_participation_requests(job_id, participation_date);

create index if not exists project_participation_requests_worker_date_idx
  on public.project_participation_requests(worker_id, participation_date);

create index if not exists project_participation_requests_status_idx
  on public.project_participation_requests(status);

alter table public.work_entries
  add column if not exists project_participation_request_id uuid
    references public.project_participation_requests(id) on delete set null;

create index if not exists work_entries_project_participation_request_id_idx
  on public.work_entries(project_participation_request_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_project_participation_requests_updated_at
  on public.project_participation_requests;
create trigger set_project_participation_requests_updated_at
before update on public.project_participation_requests
for each row execute function public.set_updated_at();

alter table public.project_participation_requests enable row level security;

drop policy if exists "Admin manages project participation requests"
  on public.project_participation_requests;
create policy "Admin manages project participation requests"
on public.project_participation_requests
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Contractors read own project participation requests"
  on public.project_participation_requests;
create policy "Contractors read own project participation requests"
on public.project_participation_requests
for select
to authenticated
using (
  exists (
    select 1
    from public.workers w
    where w.id = project_participation_requests.worker_id
      and w.auth_user_id = auth.uid()
      and coalesce(w.account_enabled, true) = true
  )
);

drop policy if exists "Contractors update own project participation requests"
  on public.project_participation_requests;

revoke insert, update, delete on public.project_participation_requests from authenticated;
grant select on public.project_participation_requests to authenticated;

notify pgrst, 'reload schema';
