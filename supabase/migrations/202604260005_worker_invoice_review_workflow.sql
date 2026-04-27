alter table public.worker_invoices
add column if not exists approved_at timestamptz,
add column if not exists submitted_at timestamptz;

do $$
begin
  alter type public.invoice_payment_status add value if not exists 'draft';
  alter type public.invoice_payment_status add value if not exists 'approved';
  alter type public.invoice_payment_status add value if not exists 'submitted';
exception
  when duplicate_object then null;
end $$;

create index if not exists worker_invoices_review_status_idx
on public.worker_invoices(payment_status, approved_at, submitted_at);

create policy "worker invoices own approve submit" on public.worker_invoices
for update using (
  worker_id = auth.uid()
  and payment_status::text in ('draft', 'approved')
) with check (
  worker_id = auth.uid()
  and payment_status::text in ('approved', 'submitted')
);
