-- Contractor invite/auth mapping.
-- Operational contractor rows remain in public.workers and map to auth.users
-- through workers.auth_user_id.

alter table public.workers
add column if not exists auth_user_id uuid unique,
add column if not exists invited_at timestamptz,
add column if not exists invite_accepted_at timestamptz,
add column if not exists account_enabled boolean not null default true;

update public.workers
set account_enabled = coalesce(account_enabled, true)
where true;

alter table public.workers
alter column account_enabled set default true,
alter column account_enabled set not null;

create unique index if not exists workers_auth_user_id_uidx
on public.workers(auth_user_id)
where auth_user_id is not null;

create index if not exists workers_auth_user_id_idx
on public.workers(auth_user_id);

create index if not exists workers_invited_at_idx
on public.workers(invited_at);

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
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workers worker
    where worker.id = target_worker_id
      and worker.auth_user_id = auth.uid()
      and coalesce(worker.account_enabled, true)
  );
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_worker_auth(uuid) to authenticated;

alter table public.workers enable row level security;
alter table public.assignments enable row level security;
alter table public.work_entries enable row level security;
alter table public.worker_invoices enable row level security;
alter table public.worker_invoice_items enable row level security;

drop policy if exists "workers admin all" on public.workers;
create policy "workers admin all"
on public.workers
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "workers self read" on public.workers;
create policy "workers self read"
on public.workers
for select
to authenticated
using (public.is_worker_auth(id) or public.is_admin());

drop policy if exists "workers self update" on public.workers;
create policy "workers self update"
on public.workers
for update
to authenticated
using (public.is_worker_auth(id))
with check (
  public.is_worker_auth(id)
  and auth_user_id = auth.uid()
  and account_enabled = true
);

drop policy if exists "assignments worker own read" on public.assignments;
create policy "assignments worker own read"
on public.assignments
for select
to authenticated
using (public.is_worker_auth(worker_id) or public.is_admin());

drop policy if exists "work entries worker own read" on public.work_entries;
create policy "work entries worker own read"
on public.work_entries
for select
to authenticated
using (public.is_worker_auth(worker_id) or public.is_admin());

drop policy if exists "work entries worker own insert" on public.work_entries;
create policy "work entries worker own insert"
on public.work_entries
for insert
to authenticated
with check (
  public.is_worker_auth(worker_id)
  and entry_role = 'worker'
  and approved = false
  and locked = false
);

drop policy if exists "work entries worker own update unlocked" on public.work_entries;
create policy "work entries worker own update unlocked"
on public.work_entries
for update
to authenticated
using (public.is_worker_auth(worker_id) and approved = false and locked = false)
with check (public.is_worker_auth(worker_id) and approved = false and locked = false);

drop policy if exists "work entries leading hand crew read" on public.work_entries;
create policy "work entries leading hand crew read"
on public.work_entries
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.assignments lead_assignment
    join public.workers lead_worker on lead_worker.id = lead_assignment.worker_id
    where lead_assignment.job_id = work_entries.job_id
      and lead_assignment.date = work_entries.work_date
      and lead_assignment.role = 'leading_hand'
      and lead_worker.auth_user_id = auth.uid()
      and coalesce(lead_worker.account_enabled, true)
  )
);

drop policy if exists "work entries leading hand crew insert" on public.work_entries;
create policy "work entries leading hand crew insert"
on public.work_entries
for insert
to authenticated
with check (
  entry_role = 'leading_hand'
  and approved = false
  and locked = false
  and exists (
    select 1
    from public.assignments lead_assignment
    join public.workers lead_worker on lead_worker.id = lead_assignment.worker_id
    where lead_assignment.job_id = work_entries.job_id
      and lead_assignment.date = work_entries.work_date
      and lead_assignment.role = 'leading_hand'
      and lead_worker.auth_user_id = auth.uid()
      and coalesce(lead_worker.account_enabled, true)
  )
  and exists (
    select 1
    from public.assignments crew_assignment
    where crew_assignment.job_id = work_entries.job_id
      and crew_assignment.date = work_entries.work_date
      and crew_assignment.worker_id = work_entries.worker_id
  )
);

drop policy if exists "work entries leading hand crew update unlocked" on public.work_entries;
create policy "work entries leading hand crew update unlocked"
on public.work_entries
for update
to authenticated
using (
  approved = false
  and locked = false
  and exists (
    select 1
    from public.assignments lead_assignment
    join public.workers lead_worker on lead_worker.id = lead_assignment.worker_id
    where lead_assignment.job_id = work_entries.job_id
      and lead_assignment.date = work_entries.work_date
      and lead_assignment.role = 'leading_hand'
      and lead_worker.auth_user_id = auth.uid()
      and coalesce(lead_worker.account_enabled, true)
  )
)
with check (
  approved = false
  and locked = false
  and exists (
    select 1
    from public.assignments lead_assignment
    join public.workers lead_worker on lead_worker.id = lead_assignment.worker_id
    where lead_assignment.job_id = work_entries.job_id
      and lead_assignment.date = work_entries.work_date
      and lead_assignment.role = 'leading_hand'
      and lead_worker.auth_user_id = auth.uid()
      and coalesce(lead_worker.account_enabled, true)
  )
  and exists (
    select 1
    from public.assignments crew_assignment
    where crew_assignment.job_id = work_entries.job_id
      and crew_assignment.date = work_entries.work_date
      and crew_assignment.worker_id = work_entries.worker_id
  )
);

drop policy if exists "worker invoices worker own read" on public.worker_invoices;
create policy "worker invoices worker own read"
on public.worker_invoices
for select
to authenticated
using (public.is_worker_auth(worker_id) or public.is_admin());

drop policy if exists "worker invoices own approve submit" on public.worker_invoices;
create policy "worker invoices own approve submit"
on public.worker_invoices
for update
to authenticated
using (public.is_worker_auth(worker_id))
with check (public.is_worker_auth(worker_id));

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

notify pgrst, 'reload schema';
