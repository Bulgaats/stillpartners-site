create table public.office_invoice_snapshots (
 id uuid primary key default gen_random_uuid(),
 source_digest text not null unique check (source_digest ~ '^[a-f0-9]{64}$'),
 exported_at timestamptz not null,
 imported_at timestamptz not null default now(),
 imported_by uuid references auth.users(id),
 payload jsonb not null check (jsonb_typeof(payload)='object' and payload->>'account'='work@stillpartners.net')
);
alter table public.office_invoice_snapshots enable row level security;
revoke all on public.office_invoice_snapshots from anon, authenticated;
grant select, insert on public.office_invoice_snapshots to authenticated;
grant all on public.office_invoice_snapshots to service_role;
create policy finance_read on public.office_invoice_snapshots for select to authenticated using ((select public.is_admin()));
create policy finance_import on public.office_invoice_snapshots for insert to authenticated with check ((select public.is_admin()) and imported_by=(select auth.uid()));
create index office_invoice_snapshots_latest on public.office_invoice_snapshots(exported_at desc);
comment on table public.office_invoice_snapshots is 'Append-only metadata snapshots. Source PDFs stay on Mac. Unknown payment status is not unpaid.';