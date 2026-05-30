-- Contractor agreement persistence for production.
-- Additive/idempotent migration: does not rename or delete existing tables/data.

create extension if not exists pgcrypto;

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

create table if not exists public.subcontractor_agreements (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  full_name text,
  agreement_version text not null default 'mvp-placeholder-v1',
  acknowledged boolean not null default false,
  signature_data_url text,
  signature_path text,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Legacy compatibility columns used by earlier application versions.
  version text,
  signature_name text,
  signature_ip inet,
  storage_path text,
  user_id uuid references auth.users(id) on delete cascade,
  profile_full_name text,
  signature_image_data_url text
);

alter table public.subcontractor_agreements
add column if not exists worker_id uuid references public.workers(id) on delete cascade,
add column if not exists auth_user_id uuid references auth.users(id) on delete cascade,
add column if not exists full_name text,
add column if not exists agreement_version text not null default 'mvp-placeholder-v1',
add column if not exists acknowledged boolean not null default false,
add column if not exists signature_data_url text,
add column if not exists signature_path text,
add column if not exists signed_at timestamptz,
add column if not exists created_at timestamptz not null default now(),
add column if not exists updated_at timestamptz not null default now(),
add column if not exists version text,
add column if not exists signature_name text,
add column if not exists signature_ip inet,
add column if not exists storage_path text,
add column if not exists user_id uuid references auth.users(id) on delete cascade,
add column if not exists profile_full_name text,
add column if not exists signature_image_data_url text;

update public.subcontractor_agreements
set
  agreement_version = coalesce(agreement_version, version, 'mvp-placeholder-v1'),
  full_name = coalesce(full_name, profile_full_name, signature_name),
  acknowledged = coalesce(acknowledged, signed_at is not null),
  signature_data_url = coalesce(signature_data_url, signature_image_data_url),
  user_id = coalesce(user_id, auth_user_id),
  profile_full_name = coalesce(profile_full_name, full_name, signature_name),
  signature_image_data_url = coalesce(signature_image_data_url, signature_data_url),
  version = coalesce(version, agreement_version),
  signature_name = coalesce(signature_name, full_name, profile_full_name)
where true;

alter table public.subcontractor_agreements
alter column agreement_version set default 'mvp-placeholder-v1',
alter column agreement_version set not null,
alter column acknowledged set default false,
alter column acknowledged set not null,
alter column created_at set default now(),
alter column created_at set not null,
alter column updated_at set default now(),
alter column updated_at set not null;

create unique index if not exists subcontractor_agreements_worker_version_uidx
on public.subcontractor_agreements(worker_id, agreement_version);

create index if not exists subcontractor_agreements_auth_user_id_idx
on public.subcontractor_agreements(auth_user_id);

create index if not exists subcontractor_agreements_worker_id_idx
on public.subcontractor_agreements(worker_id);

create index if not exists subcontractor_agreements_signed_at_idx
on public.subcontractor_agreements(signed_at desc);

drop trigger if exists subcontractor_agreements_set_updated_at on public.subcontractor_agreements;
create trigger subcontractor_agreements_set_updated_at
before update on public.subcontractor_agreements
for each row execute function public.set_updated_at();

alter table public.subcontractor_agreements enable row level security;

drop policy if exists "subcontractor agreements admin manage" on public.subcontractor_agreements;
create policy "subcontractor agreements admin manage"
on public.subcontractor_agreements
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "subcontractor agreements contractor read own" on public.subcontractor_agreements;
create policy "subcontractor agreements contractor read own"
on public.subcontractor_agreements
for select
to authenticated
using (auth_user_id = auth.uid() or public.is_admin());

drop policy if exists "subcontractor agreements contractor insert own" on public.subcontractor_agreements;
create policy "subcontractor agreements contractor insert own"
on public.subcontractor_agreements
for insert
to authenticated
with check (
  auth_user_id = auth.uid()
  and exists (
    select 1
    from public.workers
    where workers.id = subcontractor_agreements.worker_id
      and workers.auth_user_id = auth.uid()
      and coalesce(workers.account_enabled, true)
  )
);

drop policy if exists "subcontractor agreements contractor update own unsigned" on public.subcontractor_agreements;
create policy "subcontractor agreements contractor update own unsigned"
on public.subcontractor_agreements
for update
to authenticated
using (
  auth_user_id = auth.uid()
  and signed_at is null
)
with check (
  auth_user_id = auth.uid()
  and exists (
    select 1
    from public.workers
    where workers.id = subcontractor_agreements.worker_id
      and workers.auth_user_id = auth.uid()
      and coalesce(workers.account_enabled, true)
  )
);

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.subcontractor_agreements to authenticated;
grant execute on function public.is_admin() to authenticated;

notify pgrst, 'reload schema';
