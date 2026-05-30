-- Still Partners project participation/autonomy layer.
-- Additive and safe for existing production data.

create table if not exists public.contractor_availability (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete cascade,
  status text not null default 'available'
    check (status in ('available', 'limited', 'unavailable')),
  available_from date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (worker_id)
);

create table if not exists public.project_participations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  status text not null default 'requested'
    check (status in ('requested', 'interested', 'confirmed', 'declined', 'completed')),
  scope_acknowledged_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, worker_id)
);

create table if not exists public.project_notes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  worker_id uuid references public.workers(id) on delete set null,
  author_user_id uuid references auth.users(id) on delete set null,
  note_type text not null default 'participation_note'
    check (note_type in ('admin_update', 'participation_note', 'completion_note')),
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.jobs
  add column if not exists scope_summary text,
  add column if not exists estimated_timeframe text,
  add column if not exists production_target numeric,
  add column if not exists project_status text not null default 'planned'
    check (project_status in ('planned', 'awaiting_participation', 'active', 'completed'));

create index if not exists contractor_availability_worker_id_idx
  on public.contractor_availability(worker_id);

create index if not exists project_participations_job_id_idx
  on public.project_participations(job_id);

create index if not exists project_participations_worker_id_idx
  on public.project_participations(worker_id);

create index if not exists project_participations_status_idx
  on public.project_participations(status);

create index if not exists project_notes_job_id_idx
  on public.project_notes(job_id);

create index if not exists project_notes_worker_id_idx
  on public.project_notes(worker_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_contractor_availability_updated_at on public.contractor_availability;
create trigger set_contractor_availability_updated_at
before update on public.contractor_availability
for each row execute function public.set_updated_at();

drop trigger if exists set_project_participations_updated_at on public.project_participations;
create trigger set_project_participations_updated_at
before update on public.project_participations
for each row execute function public.set_updated_at();

alter table public.contractor_availability enable row level security;
alter table public.project_participations enable row level security;
alter table public.project_notes enable row level security;

drop policy if exists "Admin manages contractor availability" on public.contractor_availability;
create policy "Admin manages contractor availability"
on public.contractor_availability
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Contractors manage own availability" on public.contractor_availability;
create policy "Contractors manage own availability"
on public.contractor_availability
for all
to authenticated
using (
  exists (
    select 1 from public.workers w
    where w.id = contractor_availability.worker_id
      and w.auth_user_id = auth.uid()
      and coalesce(w.account_enabled, true) = true
  )
)
with check (
  exists (
    select 1 from public.workers w
    where w.id = contractor_availability.worker_id
      and w.auth_user_id = auth.uid()
      and coalesce(w.account_enabled, true) = true
  )
);

drop policy if exists "Admin manages project participations" on public.project_participations;
create policy "Admin manages project participations"
on public.project_participations
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Contractors manage own project participation" on public.project_participations;
create policy "Contractors manage own project participation"
on public.project_participations
for all
to authenticated
using (
  exists (
    select 1 from public.workers w
    where w.id = project_participations.worker_id
      and w.auth_user_id = auth.uid()
      and coalesce(w.account_enabled, true) = true
  )
)
with check (
  exists (
    select 1 from public.workers w
    where w.id = project_participations.worker_id
      and w.auth_user_id = auth.uid()
      and coalesce(w.account_enabled, true) = true
  )
);

drop policy if exists "Admin manages project notes" on public.project_notes;
create policy "Admin manages project notes"
on public.project_notes
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Contractors read own project notes" on public.project_notes;
create policy "Contractors read own project notes"
on public.project_notes
for select
to authenticated
using (
  worker_id is null
  or exists (
    select 1 from public.workers w
    where w.id = project_notes.worker_id
      and w.auth_user_id = auth.uid()
      and coalesce(w.account_enabled, true) = true
  )
);

drop policy if exists "Contractors create own project notes" on public.project_notes;
create policy "Contractors create own project notes"
on public.project_notes
for insert
to authenticated
with check (
  exists (
    select 1 from public.workers w
    where w.id = project_notes.worker_id
      and w.auth_user_id = auth.uid()
      and coalesce(w.account_enabled, true) = true
  )
);

grant select, insert, update, delete on public.contractor_availability to authenticated;
grant select, insert, update, delete on public.project_participations to authenticated;
grant select, insert, update, delete on public.project_notes to authenticated;

notify pgrst, 'reload schema';
