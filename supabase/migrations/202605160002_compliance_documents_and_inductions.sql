-- Still Partners compliance/document management layer.
-- Additive and safe for existing production data.

alter table public.certificates
  add column if not exists file_name text,
  add column if not exists issue_date date,
  add column if not exists document_status text,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

update public.certificates
set file_name = coalesce(file_name, title)
where file_name is null;

create table if not exists public.project_inductions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'inducted', 'expired')),
  marked_by uuid references auth.users(id) on delete set null,
  marked_at timestamptz not null default now(),
  expires_on date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, worker_id)
);

create index if not exists project_inductions_job_id_idx
  on public.project_inductions(job_id);

create index if not exists project_inductions_worker_id_idx
  on public.project_inductions(worker_id);

create index if not exists project_inductions_status_idx
  on public.project_inductions(status);

create index if not exists certificates_worker_type_idx
  on public.certificates(worker_id, certificate_type);

create index if not exists certificates_expires_on_idx
  on public.certificates(expires_on);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_project_inductions_updated_at on public.project_inductions;
create trigger set_project_inductions_updated_at
before update on public.project_inductions
for each row execute function public.set_updated_at();

alter table public.project_inductions enable row level security;

drop policy if exists "Admin manages project inductions" on public.project_inductions;
create policy "Admin manages project inductions"
on public.project_inductions
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Contractors read own project inductions" on public.project_inductions;
create policy "Contractors read own project inductions"
on public.project_inductions
for select
to authenticated
using (
  exists (
    select 1 from public.workers w
    where w.id = project_inductions.worker_id
      and w.auth_user_id = auth.uid()
      and coalesce(w.account_enabled, true) = true
  )
);

drop policy if exists "Contractors read own compliance documents" on public.certificates;
create policy "Contractors read own compliance documents"
on public.certificates
for select
to authenticated
using (
  public.is_admin()
  or worker_id = auth.uid()
  or exists (
    select 1 from public.workers w
    where w.id = certificates.worker_id
      and w.auth_user_id = auth.uid()
      and coalesce(w.account_enabled, true) = true
  )
);

drop policy if exists "Contractors upload own compliance documents" on public.certificates;
create policy "Contractors upload own compliance documents"
on public.certificates
for insert
to authenticated
with check (
  public.is_admin()
  or worker_id = auth.uid()
  or exists (
    select 1 from public.workers w
    where w.id = certificates.worker_id
      and w.auth_user_id = auth.uid()
      and coalesce(w.account_enabled, true) = true
  )
);

drop policy if exists "Contractors update own pending compliance documents" on public.certificates;
create policy "Contractors update own pending compliance documents"
on public.certificates
for update
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.workers w
    where w.id = certificates.worker_id
      and w.auth_user_id = auth.uid()
      and coalesce(w.account_enabled, true) = true
  )
)
with check (
  public.is_admin()
  or exists (
    select 1 from public.workers w
    where w.id = certificates.worker_id
      and w.auth_user_id = auth.uid()
      and coalesce(w.account_enabled, true) = true
  )
);

insert into storage.buckets (id, name, public)
values ('certificates', 'certificates', false)
on conflict (id) do update set public = false;

drop policy if exists "certificate files admin all" on storage.objects;
create policy "certificate files admin all" on storage.objects
for all
to authenticated
using (bucket_id = 'certificates' and public.is_admin())
with check (bucket_id = 'certificates' and public.is_admin());

drop policy if exists "certificate files contractor own folder" on storage.objects;
create policy "certificate files contractor own folder" on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'certificates'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1 from public.workers w
      where w.id::text = (storage.foldername(name))[1]
        and w.auth_user_id = auth.uid()
        and coalesce(w.account_enabled, true) = true
    )
  )
);

drop policy if exists "certificate files contractor own read" on storage.objects;
create policy "certificate files contractor own read" on storage.objects
for select
to authenticated
using (
  bucket_id = 'certificates'
  and (
    public.is_admin()
    or (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1 from public.workers w
      where w.id::text = (storage.foldername(name))[1]
        and w.auth_user_id = auth.uid()
        and coalesce(w.account_enabled, true) = true
    )
  )
);

grant select, insert, update, delete on public.project_inductions to authenticated;
grant select, insert, update on public.certificates to authenticated;

notify pgrst, 'reload schema';
