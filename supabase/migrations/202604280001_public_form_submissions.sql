-- Public website form submissions only.
-- Safe to run on a brand new Supabase project.

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

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Temporary public-forms-only admin helper.
-- It returns false until the internal dashboard/auth schema is added.
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select false;
$$;

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

drop trigger if exists subcontractor_applications_updated_at on public.subcontractor_applications;
create trigger subcontractor_applications_updated_at
before update on public.subcontractor_applications
for each row execute function public.set_updated_at();

drop trigger if exists client_requests_updated_at on public.client_requests;
create trigger client_requests_updated_at
before update on public.client_requests
for each row execute function public.set_updated_at();

drop trigger if exists contact_messages_updated_at on public.contact_messages;
create trigger contact_messages_updated_at
before update on public.contact_messages
for each row execute function public.set_updated_at();

alter table public.subcontractor_applications enable row level security;
alter table public.client_requests enable row level security;
alter table public.contact_messages enable row level security;

drop policy if exists "subcontractor applications public insert" on public.subcontractor_applications;
create policy "subcontractor applications public insert"
on public.subcontractor_applications
for insert
to anon, authenticated
with check (true);

drop policy if exists "client requests public insert" on public.client_requests;
create policy "client requests public insert"
on public.client_requests
for insert
to anon, authenticated
with check (true);

drop policy if exists "contact messages public insert" on public.contact_messages;
create policy "contact messages public insert"
on public.contact_messages
for insert
to anon, authenticated
with check (true);

-- Admin policies are harmless now because public.is_admin() returns false.
-- Replace public.is_admin() later when internal auth/admin profiles are added.
drop policy if exists "subcontractor applications admin all" on public.subcontractor_applications;
create policy "subcontractor applications admin all"
on public.subcontractor_applications
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "client requests admin all" on public.client_requests;
create policy "client requests admin all"
on public.client_requests
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "contact messages admin all" on public.contact_messages;
create policy "contact messages admin all"
on public.contact_messages
for all
using (public.is_admin())
with check (public.is_admin());

grant usage on schema public to anon, authenticated;

grant insert on public.subcontractor_applications to anon, authenticated;
grant insert on public.client_requests to anon, authenticated;
grant insert on public.contact_messages to anon, authenticated;

grant select, insert, update, delete on public.subcontractor_applications to authenticated;
grant select, insert, update, delete on public.client_requests to authenticated;
grant select, insert, update, delete on public.contact_messages to authenticated;

create index if not exists subcontractor_applications_status_idx
on public.subcontractor_applications(status, created_at desc);

create index if not exists subcontractor_applications_email_idx
on public.subcontractor_applications(email);

create index if not exists client_requests_status_idx
on public.client_requests(status, created_at desc);

create index if not exists client_requests_email_idx
on public.client_requests(email);

create index if not exists contact_messages_status_idx
on public.contact_messages(status, created_at desc);

create index if not exists contact_messages_email_idx
on public.contact_messages(email);

notify pgrst, 'reload schema';
