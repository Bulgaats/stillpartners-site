-- Minimal internal beta admin bootstrap.
-- Run after the public forms migration in a Supabase project.

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

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
before update on public.profiles
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
with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

drop policy if exists "profiles admin all" on public.profiles;
create policy "profiles admin all"
on public.profiles
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select, update on public.profiles to authenticated;

-- Public form admin policies rely on public.is_admin().
drop policy if exists "subcontractor applications admin all" on public.subcontractor_applications;
create policy "subcontractor applications admin all"
on public.subcontractor_applications
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "client requests admin all" on public.client_requests;
create policy "client requests admin all"
on public.client_requests
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "contact messages admin all" on public.contact_messages;
create policy "contact messages admin all"
on public.contact_messages
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select, update on public.subcontractor_applications to authenticated;
grant select, update on public.client_requests to authenticated;
grant select, update on public.contact_messages to authenticated;

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_active_idx on public.profiles(is_active);

notify pgrst, 'reload schema';
