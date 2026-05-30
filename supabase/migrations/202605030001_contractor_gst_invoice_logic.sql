-- Contractor GST registration and invoice GST snapshot fields.
-- Table names stay worker_* for database compatibility.

alter table public.workers
add column if not exists gst_registered boolean not null default false,
add column if not exists gst_registered_confirmed_at timestamptz;

alter table public.worker_invoices
add column if not exists gst_registered boolean not null default false,
add column if not exists gst_amount numeric(12, 2) not null default 0,
add column if not exists total_amount numeric(12, 2),
add column if not exists invoice_title text not null default 'Invoice';

update public.worker_invoices
set
  gst_registered = coalesce(gst_registered, false),
  gst_amount = coalesce(gst_amount, 0),
  invoice_title = case
    when coalesce(gst_registered, false) then 'Tax Invoice'
    else 'Invoice'
  end,
  total_amount = coalesce(total_amount, subtotal + coalesce(gst_amount, 0))
where true;

alter table public.worker_invoices
drop constraint if exists worker_invoices_invoice_title_check,
add constraint worker_invoices_invoice_title_check
check (invoice_title in ('Invoice', 'Tax Invoice')) not valid;

create index if not exists workers_gst_registered_idx
on public.workers(gst_registered);

notify pgrst, 'reload schema';
