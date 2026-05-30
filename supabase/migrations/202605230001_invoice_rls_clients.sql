-- Production fix: contractor invoice PDF access, contractor invoice status updates,
-- and missing admin clients table.
-- Safe to run multiple times.

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

create or replace function public.is_worker_auth(target_worker_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if target_worker_id is null or to_regclass('public.workers') is null then
    return false;
  end if;

  return exists (
    select 1
    from public.workers
    where id = target_worker_id
      and auth_user_id = auth.uid()
      and coalesce(account_enabled, true)
  );
end;
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_worker_auth(uuid) to authenticated;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  billing_email text,
  contact_name text,
  email text,
  phone text,
  abn text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.clients
  add column if not exists name text,
  add column if not exists billing_email text,
  add column if not exists contact_name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists abn text,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.clients
set
  name = coalesce(nullif(name, ''), contact_name, email, 'Unnamed client'),
  billing_email = coalesce(nullif(billing_email, ''), email),
  is_active = coalesce(is_active, true),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where true;

alter table public.clients
  alter column name set not null,
  alter column is_active set default true,
  alter column is_active set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at
before update on public.clients
for each row
execute function public.set_updated_at();

alter table public.clients enable row level security;

drop policy if exists "clients admin all" on public.clients;
create policy "clients admin all"
on public.clients
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select, insert, update, delete on public.clients to authenticated;

create index if not exists clients_name_idx on public.clients (name);
create index if not exists clients_active_idx on public.clients (is_active);
create index if not exists clients_billing_email_idx on public.clients (billing_email);

alter table if exists public.worker_invoices enable row level security;
alter table if exists public.worker_invoice_items enable row level security;

drop policy if exists "worker invoices admin all" on public.worker_invoices;
create policy "worker invoices admin all"
on public.worker_invoices
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "worker invoices worker own read" on public.worker_invoices;
create policy "worker invoices worker own read"
on public.worker_invoices
for select
to authenticated
using (public.is_admin() or public.is_worker_auth(worker_id));

drop policy if exists "worker invoices own approve submit" on public.worker_invoices;
create policy "worker invoices own approve submit"
on public.worker_invoices
for update
to authenticated
using (public.is_worker_auth(worker_id))
with check (public.is_worker_auth(worker_id));

drop policy if exists "worker invoice items admin all" on public.worker_invoice_items;
create policy "worker invoice items admin all"
on public.worker_invoice_items
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "worker invoice items worker own read" on public.worker_invoice_items;
create policy "worker invoice items worker own read"
on public.worker_invoice_items
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.worker_invoices invoice
    where invoice.id = worker_invoice_items.invoice_id
      and public.is_worker_auth(invoice.worker_id)
  )
);

insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do update
set public = false;

drop policy if exists "invoice pdfs admin all" on storage.objects;
create policy "invoice pdfs admin all"
on storage.objects
for all
to authenticated
using (bucket_id = 'invoices' and public.is_admin())
with check (bucket_id = 'invoices' and public.is_admin());

drop policy if exists "contractor invoice pdfs own read" on storage.objects;
create policy "contractor invoice pdfs own read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'invoices'
  and exists (
    select 1
    from public.worker_invoices invoice
    where invoice.id::text = regexp_replace(
        storage.objects.name,
        '^invoices/([^/]+)\.pdf$',
        '\1'
      )
      and public.is_worker_auth(invoice.worker_id)
  )
);

grant select, insert, update, delete on storage.objects to authenticated;

notify pgrst, 'reload schema';
