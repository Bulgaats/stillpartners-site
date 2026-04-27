-- Worker invoicing is output-based: invoices use tonnes completed as the
-- primary unit. Estimated hours remain available for admin planning only.

alter table public.timesheets
add column if not exists tonnes_completed numeric(10, 3),
add column if not exists estimated_hours numeric(6, 2);

update public.timesheets
set
  tonnes_completed = coalesce(tonnes_completed, tonnes),
  estimated_hours = coalesce(estimated_hours, hours)
where tonnes_completed is null or estimated_hours is null;

alter table public.timesheets
alter column tonnes_completed set not null;

alter table public.timesheets
drop constraint if exists timesheets_tonnes_completed_check;

alter table public.timesheets
add constraint timesheets_tonnes_completed_check
check (tonnes_completed >= 0);

alter table public.timesheet_correction_requests
add column if not exists requested_tonnes numeric(10, 3);

update public.timesheet_correction_requests
set requested_tonnes = coalesce(requested_tonnes, round(requested_hours / 10.0, 3))
where requested_tonnes is null;

alter table public.timesheet_correction_requests
drop constraint if exists correction_requested_tonnes_check;

alter table public.timesheet_correction_requests
add constraint correction_requested_tonnes_check
check (requested_tonnes is null or requested_tonnes >= 0);

alter table public.worker_invoice_items
add column if not exists work_date date,
add column if not exists site_name text;

alter table public.client_invoice_items
add column if not exists work_date date,
add column if not exists site_name text;

create index if not exists timesheets_worker_tonnes_idx
on public.timesheets(worker_id, work_date, tonnes_completed);

create index if not exists worker_invoice_items_site_date_idx
on public.worker_invoice_items(work_date, site_name);
