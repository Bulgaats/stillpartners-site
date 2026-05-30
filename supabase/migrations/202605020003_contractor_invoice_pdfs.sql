-- Contractor invoice PDF storage support.
-- Keeps existing worker_* table names for database stability while exposing
-- contractor wording in the application UI.

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

alter table public.worker_invoices
add column if not exists pdf_url text;

insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "invoice pdfs admin all" on storage.objects;
create policy "invoice pdfs admin all"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'invoices'
  and public.is_admin()
)
with check (
  bucket_id = 'invoices'
  and public.is_admin()
);

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
      and invoice.worker_id = auth.uid()
  )
);

grant select, insert, update, delete on storage.objects to authenticated;

create index if not exists worker_invoices_pdf_url_idx
on public.worker_invoices(pdf_url)
where pdf_url is not null;

notify pgrst, 'reload schema';
