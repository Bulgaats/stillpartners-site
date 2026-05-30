-- Worker invoice drafts generated from approved and locked work_entries.
-- Worker-facing invoices display tonnes; hours remain internal/admin-only.

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

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.worker_invoices (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  invoice_number text not null,
  total_hours numeric(10, 2) not null default 0,
  total_tonnes numeric(10, 3) not null default 0,
  rate_per_tonne numeric(12, 2),
  subtotal numeric(12, 2),
  status text not null default 'draft',
  approved_by_worker_at timestamptz,
  submitted_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.worker_invoices
add column if not exists worker_id uuid,
add column if not exists period_start date,
add column if not exists period_end date,
add column if not exists invoice_number text,
add column if not exists total_hours numeric(10, 2) not null default 0,
add column if not exists total_tonnes numeric(10, 3) not null default 0,
add column if not exists rate_per_tonne numeric(12, 2),
add column if not exists subtotal numeric(12, 2),
add column if not exists status text not null default 'draft',
add column if not exists approved_by_worker_at timestamptz,
add column if not exists submitted_at timestamptz,
add column if not exists paid_at timestamptz,
add column if not exists created_at timestamptz not null default now(),
add column if not exists updated_at timestamptz not null default now();

update public.worker_invoices
set
  status = coalesce(status, 'draft'),
  total_hours = coalesce(total_hours, 0),
  total_tonnes = coalesce(total_tonnes, 0),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where true;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'worker_invoices'
      and column_name = 'payment_status'
  ) then
    execute $sql$
      update public.worker_invoices
      set status = coalesce(status, payment_status::text, 'draft')
    $sql$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'worker_invoices'
      and column_name = 'total'
  ) then
    execute $sql$
      update public.worker_invoices
      set subtotal = coalesce(subtotal, total)
    $sql$;
  end if;
end;
$$;

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.worker_invoices'::regclass
      and contype = 'f'
      and array_length(conkey, 1) = 1
      and conkey[1] = (
        select attnum
        from pg_attribute
        where attrelid = 'public.worker_invoices'::regclass
          and attname = 'worker_id'
      )
  loop
    execute format('alter table public.worker_invoices drop constraint if exists %I', constraint_record.conname);
  end loop;
end;
$$;

alter table public.worker_invoices
alter column total_hours set default 0,
alter column total_hours set not null,
alter column total_tonnes set default 0,
alter column total_tonnes set not null,
alter column status set default 'draft',
alter column status set not null,
alter column created_at set default now(),
alter column created_at set not null,
alter column updated_at set default now(),
alter column updated_at set not null;

alter table public.worker_invoices
drop constraint if exists worker_invoices_worker_id_fkey,
add constraint worker_invoices_worker_id_fkey
foreign key (worker_id) references public.workers(id) on delete cascade not valid;

alter table public.worker_invoices
drop constraint if exists worker_invoices_status_check,
add constraint worker_invoices_status_check
check (status in ('draft', 'approved_by_worker', 'submitted', 'paid')) not valid;

create table if not exists public.worker_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.worker_invoices(id) on delete cascade,
  work_entry_id uuid not null references public.work_entries(id) on delete restrict,
  worker_id uuid not null references public.workers(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  work_date date not null,
  hours numeric(10, 2) not null default 0,
  tonnes numeric(10, 3) not null default 0,
  created_at timestamptz not null default now()
);

alter table public.worker_invoice_items
add column if not exists invoice_id uuid references public.worker_invoices(id) on delete cascade,
add column if not exists work_entry_id uuid references public.work_entries(id) on delete restrict,
add column if not exists worker_id uuid references public.workers(id) on delete cascade,
add column if not exists job_id uuid references public.jobs(id) on delete cascade,
add column if not exists work_date date,
add column if not exists hours numeric(10, 2) not null default 0,
add column if not exists tonnes numeric(10, 3) not null default 0,
add column if not exists created_at timestamptz not null default now();

update public.worker_invoice_items
set
  hours = coalesce(hours, 0),
  tonnes = coalesce(tonnes, 0),
  created_at = coalesce(created_at, now())
where true;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'worker_invoice_items'
      and column_name = 'worker_invoice_id'
  ) then
    execute $sql$
      update public.worker_invoice_items
      set invoice_id = coalesce(invoice_id, worker_invoice_id)
    $sql$;
  end if;
end;
$$;

alter table public.worker_invoice_items
alter column hours set default 0,
alter column hours set not null,
alter column tonnes set default 0,
alter column tonnes set not null,
alter column created_at set default now(),
alter column created_at set not null;

drop trigger if exists worker_invoices_set_updated_at on public.worker_invoices;
create trigger worker_invoices_set_updated_at
before update on public.worker_invoices
for each row
execute function public.set_updated_at();

alter table public.worker_invoices enable row level security;
alter table public.worker_invoice_items enable row level security;

drop policy if exists "worker invoices admin all" on public.worker_invoices;
create policy "worker invoices admin all"
on public.worker_invoices
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "worker invoice items admin all" on public.worker_invoice_items;
create policy "worker invoice items admin all"
on public.worker_invoice_items
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "worker invoices worker own read" on public.worker_invoices;
create policy "worker invoices worker own read"
on public.worker_invoices
for select
to authenticated
using (worker_id = auth.uid() or public.is_admin());

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
      and invoice.worker_id = auth.uid()
  )
);

grant select, insert, update, delete on public.worker_invoices to authenticated;
grant select, insert, update, delete on public.worker_invoice_items to authenticated;

create unique index if not exists worker_invoices_worker_period_uidx
on public.worker_invoices(worker_id, period_start, period_end);

create unique index if not exists worker_invoices_invoice_number_uidx
on public.worker_invoices(invoice_number);

create unique index if not exists worker_invoice_items_work_entry_uidx
on public.worker_invoice_items(work_entry_id)
where work_entry_id is not null;

create index if not exists worker_invoices_status_idx
on public.worker_invoices(status, period_start desc);

create index if not exists worker_invoice_items_invoice_id_idx
on public.worker_invoice_items(invoice_id);

create index if not exists worker_invoice_items_worker_job_date_idx
on public.worker_invoice_items(worker_id, job_id, work_date);

comment on policy "worker invoices worker own read" on public.worker_invoices is
'Worker access assumes workers.id matches auth.uid(). If workers are later linked through profiles, update this policy to use that mapping.';

notify pgrst, 'reload schema';
