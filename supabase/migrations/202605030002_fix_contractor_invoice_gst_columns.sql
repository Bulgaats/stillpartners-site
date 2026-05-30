-- Fix contractor invoice GST column names.
-- The app uses gst_amount and total_amount, not a bare gst column.

alter table public.workers
add column if not exists gst_registered boolean not null default false,
add column if not exists gst_registered_confirmed_at timestamptz;

alter table public.worker_invoices
add column if not exists gst_registered boolean not null default false,
add column if not exists gst_amount numeric(12, 2) not null default 0,
add column if not exists total_amount numeric(12, 2) not null default 0,
add column if not exists invoice_title text not null default 'Invoice';

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'worker_invoices'
      and column_name = 'gst'
  ) then
    execute $sql$
      update public.worker_invoices
      set gst_amount = coalesce(gst_amount, gst, 0)
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
      set total_amount = coalesce(total_amount, total, subtotal + coalesce(gst_amount, 0), 0)
    $sql$;
  else
    update public.worker_invoices
    set total_amount = coalesce(total_amount, subtotal + coalesce(gst_amount, 0), 0);
  end if;
end;
$$;

update public.worker_invoices
set
  gst_registered = coalesce(gst_registered, false),
  gst_amount = coalesce(gst_amount, 0),
  total_amount = coalesce(total_amount, subtotal + coalesce(gst_amount, 0), 0),
  invoice_title = case
    when coalesce(gst_registered, false) then 'Tax Invoice'
    else 'Invoice'
  end
where true;

alter table public.worker_invoices
alter column gst_registered set default false,
alter column gst_registered set not null,
alter column gst_amount set default 0,
alter column gst_amount set not null,
alter column total_amount set default 0,
alter column total_amount set not null,
alter column invoice_title set default 'Invoice',
alter column invoice_title set not null;

alter table public.worker_invoices
drop constraint if exists worker_invoices_invoice_title_check,
add constraint worker_invoices_invoice_title_check
check (invoice_title in ('Invoice', 'Tax Invoice')) not valid;

create index if not exists workers_gst_registered_idx
on public.workers(gst_registered);

notify pgrst, 'reload schema';
