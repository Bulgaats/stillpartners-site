-- Still Partners client invoice production/scope layer.
-- Additive and safe for existing production data.

alter table public.client_invoices
  add column if not exists subtotal numeric(12,2) not null default 0,
  add column if not exists gst_amount numeric(12,2) not null default 0,
  add column if not exists total_amount numeric(12,2) not null default 0,
  add column if not exists pdf_url text,
  add column if not exists paid_at timestamptz;

update public.client_invoices
set
  subtotal = coalesce(nullif(subtotal, 0), total, total_amount, 0),
  gst_amount = coalesce(gst_amount, 0),
  total_amount = coalesce(nullif(total_amount, 0), total, subtotal + gst_amount, 0)
where total_amount = 0 or subtotal = 0;

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.client_invoices'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%payment_status%'
  loop
    execute format('alter table public.client_invoices drop constraint if exists %I', constraint_record.conname);
  end loop;
end $$;

alter table public.client_invoices
  add constraint client_invoices_payment_status_check
  check (payment_status in ('draft', 'pending', 'sent', 'paid', 'cancelled'));

alter table public.client_invoice_items
  add column if not exists work_entry_id uuid references public.work_entries(id) on delete set null,
  add column if not exists job_id uuid references public.jobs(id) on delete set null;

create index if not exists client_invoices_status_idx
  on public.client_invoices(payment_status, period_start desc);

create index if not exists client_invoices_pdf_url_idx
  on public.client_invoices(pdf_url)
  where pdf_url is not null;

create index if not exists client_invoice_items_work_entry_id_idx
  on public.client_invoice_items(work_entry_id)
  where work_entry_id is not null;

create index if not exists client_invoice_items_job_id_idx
  on public.client_invoice_items(job_id)
  where job_id is not null;

grant select, insert, update, delete on public.client_invoices to authenticated;
grant select, insert, update, delete on public.client_invoice_items to authenticated;

notify pgrst, 'reload schema';
