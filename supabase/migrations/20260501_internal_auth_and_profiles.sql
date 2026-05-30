-- Consolidated public forms + internal beta auth/profile bootstrap.
-- Safe to run multiple times on a Supabase project.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'lead_status'
  ) then
    create type public.lead_status as enum (
      'new',
      'contacted',
      'qualified',
      'converted',
      'archived'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'app_role'
  ) then
    create type public.app_role as enum ('worker', 'admin');
  end if;
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

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'worker',
  full_name text not null default '',
  phone text,
  abn text,
  agreement_signed_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
add column if not exists role public.app_role not null default 'worker',
add column if not exists full_name text not null default '',
add column if not exists phone text,
add column if not exists abn text,
add column if not exists agreement_signed_at timestamptz,
add column if not exists is_active boolean not null default true,
add column if not exists created_at timestamptz not null default now(),
add column if not exists updated_at timestamptz not null default now();

update public.profiles
set
  role = coalesce(role, 'worker'),
  full_name = coalesce(full_name, ''),
  is_active = coalesce(is_active, true),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.profiles
alter column role set default 'worker',
alter column role set not null,
alter column full_name set default '',
alter column full_name set not null,
alter column is_active set default true,
alter column is_active set not null,
alter column created_at set default now(),
alter column created_at set not null,
alter column updated_at set default now(),
alter column updated_at set not null;

create table if not exists public.client_requests (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text not null,
  email text not null,
  phone text,
  required_trades text,
  project_location text,
  message text,
  status public.lead_status not null default 'new',
  preferred_language text not null default 'en',
  source_page text,
  user_agent text,
  ip_address inet,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_requests_email_check check (position('@' in email) > 1),
  constraint client_requests_language_check check (preferred_language in ('en', 'mn'))
);

alter table public.client_requests
add column if not exists company_name text,
add column if not exists contact_name text,
add column if not exists email text,
add column if not exists phone text,
add column if not exists required_trades text,
add column if not exists project_location text,
add column if not exists message text,
add column if not exists status public.lead_status not null default 'new',
add column if not exists preferred_language text not null default 'en',
add column if not exists source_page text,
add column if not exists user_agent text,
add column if not exists ip_address inet,
add column if not exists created_at timestamptz not null default now(),
add column if not exists updated_at timestamptz not null default now();

update public.client_requests
set
  company_name = coalesce(company_name, 'Unknown company'),
  contact_name = coalesce(contact_name, 'Unknown contact'),
  email = coalesce(email, 'unknown@example.invalid'),
  status = coalesce(status, 'new'),
  preferred_language = coalesce(preferred_language, 'en'),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.client_requests
alter column company_name set not null,
alter column contact_name set not null,
alter column email set not null,
alter column status set default 'new',
alter column status set not null,
alter column preferred_language set default 'en',
alter column preferred_language set not null,
alter column created_at set default now(),
alter column created_at set not null,
alter column updated_at set default now(),
alter column updated_at set not null;

create table if not exists public.subcontractor_applications (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  trade text not null,
  abn text,
  has_white_card boolean not null default false,
  message text,
  status public.lead_status not null default 'new',
  preferred_language text not null default 'en',
  source_page text,
  user_agent text,
  ip_address inet,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subcontractor_applications_email_check check (position('@' in email) > 1),
  constraint subcontractor_applications_language_check check (preferred_language in ('en', 'mn'))
);

alter table public.subcontractor_applications
add column if not exists full_name text,
add column if not exists email text,
add column if not exists phone text,
add column if not exists trade text,
add column if not exists abn text,
add column if not exists has_white_card boolean not null default false,
add column if not exists message text,
add column if not exists status public.lead_status not null default 'new',
add column if not exists preferred_language text not null default 'en',
add column if not exists source_page text,
add column if not exists user_agent text,
add column if not exists ip_address inet,
add column if not exists created_at timestamptz not null default now(),
add column if not exists updated_at timestamptz not null default now();

update public.subcontractor_applications
set
  full_name = coalesce(full_name, 'Unknown applicant'),
  email = coalesce(email, 'unknown@example.invalid'),
  trade = coalesce(trade, 'Unknown trade'),
  has_white_card = coalesce(has_white_card, false),
  status = coalesce(status, 'new'),
  preferred_language = coalesce(preferred_language, 'en'),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.subcontractor_applications
alter column full_name set not null,
alter column email set not null,
alter column trade set not null,
alter column has_white_card set default false,
alter column has_white_card set not null,
alter column status set default 'new',
alter column status set not null,
alter column preferred_language set default 'en',
alter column preferred_language set not null,
alter column created_at set default now(),
alter column created_at set not null,
alter column updated_at set default now(),
alter column updated_at set not null;

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  subject text,
  message text not null,
  status public.lead_status not null default 'new',
  preferred_language text not null default 'en',
  source_page text,
  user_agent text,
  ip_address inet,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contact_messages_email_check check (position('@' in email) > 1),
  constraint contact_messages_language_check check (preferred_language in ('en', 'mn'))
);

alter table public.contact_messages
add column if not exists name text,
add column if not exists email text,
add column if not exists phone text,
add column if not exists subject text,
add column if not exists message text,
add column if not exists status public.lead_status not null default 'new',
add column if not exists preferred_language text not null default 'en',
add column if not exists source_page text,
add column if not exists user_agent text,
add column if not exists ip_address inet,
add column if not exists created_at timestamptz not null default now(),
add column if not exists updated_at timestamptz not null default now();

update public.contact_messages
set
  name = coalesce(name, 'Unknown sender'),
  email = coalesce(email, 'unknown@example.invalid'),
  message = coalesce(message, 'No message supplied'),
  status = coalesce(status, 'new'),
  preferred_language = coalesce(preferred_language, 'en'),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.contact_messages
alter column name set not null,
alter column email set not null,
alter column message set not null,
alter column status set default 'new',
alter column status set not null,
alter column preferred_language set default 'en',
alter column preferred_language set not null,
alter column created_at set default now(),
alter column created_at set not null,
alter column updated_at set default now(),
alter column updated_at set not null;

alter table public.client_requests
drop constraint if exists client_requests_email_check,
drop constraint if exists client_requests_language_check,
add constraint client_requests_email_check check (position('@' in email) > 1),
add constraint client_requests_language_check check (preferred_language in ('en', 'mn'));

alter table public.subcontractor_applications
drop constraint if exists subcontractor_applications_email_check,
drop constraint if exists subcontractor_applications_language_check,
add constraint subcontractor_applications_email_check check (position('@' in email) > 1),
add constraint subcontractor_applications_language_check check (preferred_language in ('en', 'mn'));

alter table public.contact_messages
drop constraint if exists contact_messages_email_check,
drop constraint if exists contact_messages_language_check,
add constraint contact_messages_email_check check (position('@' in email) > 1),
add constraint contact_messages_language_check check (preferred_language in ('en', 'mn'));

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists client_requests_updated_at on public.client_requests;
create trigger client_requests_updated_at
before update on public.client_requests
for each row execute function public.set_updated_at();

drop trigger if exists subcontractor_applications_updated_at on public.subcontractor_applications;
create trigger subcontractor_applications_updated_at
before update on public.subcontractor_applications
for each row execute function public.set_updated_at();

drop trigger if exists contact_messages_updated_at on public.contact_messages;
create trigger contact_messages_updated_at
before update on public.contact_messages
for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role = 'admin'
        and is_active = true
    ),
    false
  );
$$;

alter table public.profiles enable row level security;
alter table public.client_requests enable row level security;
alter table public.subcontractor_applications enable row level security;
alter table public.contact_messages enable row level security;

drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read"
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles self update non role fields" on public.profiles;
create policy "profiles self update non role fields"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (
  id = auth.uid()
  and role = (select role from public.profiles where id = auth.uid())
);

drop policy if exists "profiles admin all" on public.profiles;
create policy "profiles admin all"
on public.profiles
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "client requests public insert" on public.client_requests;
create policy "client requests public insert"
on public.client_requests
for insert
to anon, authenticated
with check (true);

drop policy if exists "client requests admin all" on public.client_requests;
create policy "client requests admin all"
on public.client_requests
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "subcontractor applications public insert" on public.subcontractor_applications;
create policy "subcontractor applications public insert"
on public.subcontractor_applications
for insert
to anon, authenticated
with check (true);

drop policy if exists "subcontractor applications admin all" on public.subcontractor_applications;
create policy "subcontractor applications admin all"
on public.subcontractor_applications
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "contact messages public insert" on public.contact_messages;
create policy "contact messages public insert"
on public.contact_messages
for insert
to anon, authenticated
with check (true);

drop policy if exists "contact messages admin all" on public.contact_messages;
create policy "contact messages admin all"
on public.contact_messages
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant usage on schema public to anon, authenticated;

grant select, update on public.profiles to authenticated;

grant insert on public.client_requests to anon, authenticated;
grant select, update, delete on public.client_requests to authenticated;

grant insert on public.subcontractor_applications to anon, authenticated;
grant select, update, delete on public.subcontractor_applications to authenticated;

grant insert on public.contact_messages to anon, authenticated;
grant select, update, delete on public.contact_messages to authenticated;

create index if not exists profiles_role_idx
on public.profiles(role);

create index if not exists profiles_active_idx
on public.profiles(is_active);

create index if not exists client_requests_status_idx
on public.client_requests(status, created_at desc);

create index if not exists client_requests_email_idx
on public.client_requests(email);

create index if not exists subcontractor_applications_status_idx
on public.subcontractor_applications(status, created_at desc);

create index if not exists subcontractor_applications_email_idx
on public.subcontractor_applications(email);

create index if not exists contact_messages_status_idx
on public.contact_messages(status, created_at desc);

create index if not exists contact_messages_email_idx
on public.contact_messages(email);

notify pgrst, 'reload schema';
