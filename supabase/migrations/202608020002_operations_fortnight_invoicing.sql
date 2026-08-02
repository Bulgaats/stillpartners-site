-- Private operations workspace and finance-only fortnight client invoicing.

create extension if not exists pgcrypto;

create or replace function public.is_operations_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role::text = 'operations_admin'
      and coalesce(is_active, true)
  );
$$;

create or replace function public.can_access_operations()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or public.is_operations_admin();
$$;

grant execute on function public.is_operations_admin() to authenticated;
grant execute on function public.can_access_operations() to authenticated;

alter table public.work_entries
  drop constraint if exists work_entries_entry_role_check;

alter table public.work_entries
  add constraint work_entries_entry_role_check
  check (entry_role in ('admin', 'operations_admin', 'leading_hand', 'worker')) not valid;

drop policy if exists "work entries operations admin read" on public.work_entries;
create policy "work entries operations admin read"
on public.work_entries
for select
to authenticated
using (public.is_operations_admin());

drop policy if exists "work entries operations admin insert" on public.work_entries;
create policy "work entries operations admin insert"
on public.work_entries
for insert
to authenticated
with check (
  public.is_operations_admin()
  and entered_by = auth.uid()
  and entry_role = 'operations_admin'
  and approved = false
  and locked = false
);

drop policy if exists "work entries operations admin update unlocked" on public.work_entries;
create policy "work entries operations admin update unlocked"
on public.work_entries
for update
to authenticated
using (
  public.is_operations_admin()
  and approved = false
  and locked = false
)
with check (
  public.is_operations_admin()
  and approved = false
  and locked = false
  and entry_role = 'operations_admin'
);

alter table public.client_invoices
  add column if not exists gst_applied boolean not null default true,
  add column if not exists local_archive_status text not null default 'pending';

alter table public.client_invoices
  drop constraint if exists client_invoices_local_archive_status_check,
  add constraint client_invoices_local_archive_status_check
  check (local_archive_status in ('pending', 'synced', 'error')) not valid;

create sequence if not exists public.client_invoice_sequence start with 1;

create or replace function public.create_operations_client_invoice(
  p_client_id uuid,
  p_project_ids uuid[],
  p_period_start date,
  p_period_end date,
  p_rate_per_tonne numeric,
  p_gst_applied boolean default true
)
returns table (
  invoice_id uuid,
  invoice_number text,
  subtotal numeric,
  gst_amount numeric,
  total_amount numeric,
  entry_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_id uuid;
  v_invoice_number text;
  v_subtotal numeric(12,2);
  v_gst numeric(12,2);
  v_total numeric(12,2);
  v_entry_count integer;
  v_sequence bigint;
  v_payment_terms integer;
begin
  if not public.is_admin() then
    raise exception 'Finance admin access required.' using errcode = '42501';
  end if;

  if p_client_id is null
    or coalesce(array_length(p_project_ids, 1), 0) = 0
    or p_period_start is null
    or p_period_end is null
    or p_period_end < p_period_start
    or coalesce(p_rate_per_tonne, 0) <= 0 then
    raise exception 'Client, project, valid invoice period and positive rate are required.';
  end if;

  if exists (
    select 1
    from unnest(p_project_ids) selected_project_id
    left join public.jobs j on j.id = selected_project_id
    where j.id is null or j.client_id is distinct from p_client_id
  ) then
    raise exception 'Every selected project must belong to the selected client.';
  end if;

  select coalesce(payment_terms_days, 14)
  into v_payment_terms
  from public.clients
  where id = p_client_id
    and coalesce(is_active, true);

  if v_payment_terms is null then
    raise exception 'The selected client is inactive or unavailable.';
  end if;

  select
    count(*)::integer,
    round(sum(round((we.hours / 10.0), 3) * p_rate_per_tonne), 2)
  into v_entry_count, v_subtotal
  from public.work_entries we
  where we.job_id = any(p_project_ids)
    and we.work_date between p_period_start and p_period_end
    and we.hours > 0
    and not exists (
      select 1
      from public.client_invoice_items existing_item
      where existing_item.work_entry_id = we.id
    );

  if coalesce(v_entry_count, 0) = 0 then
    raise exception 'No uninvoiced production records were found for this selection.';
  end if;

  v_subtotal := coalesce(v_subtotal, 0);
  v_gst := case when p_gst_applied then round(v_subtotal * 0.10, 2) else 0 end;
  v_total := v_subtotal + v_gst;
  v_sequence := nextval('public.client_invoice_sequence');
  v_invoice_number := 'CINV-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(v_sequence::text, 4, '0');

  insert into public.client_invoices (
    client_id,
    invoice_number,
    period_start,
    period_end,
    payment_status,
    subtotal,
    gst_amount,
    total,
    total_amount,
    gst_applied,
    local_archive_status,
    due_on,
    notes,
    created_by
  ) values (
    p_client_id,
    v_invoice_number,
    p_period_start,
    p_period_end,
    'draft',
    v_subtotal,
    v_gst,
    v_total,
    v_total,
    p_gst_applied,
    'pending',
    current_date + v_payment_terms,
    'Generated from operational records in the selected invoice period.',
    auth.uid()
  ) returning id into v_invoice_id;

  insert into public.client_invoice_items (
    client_invoice_id,
    work_entry_id,
    job_id,
    description,
    hours,
    tonnes,
    rate,
    total,
    work_date,
    site_name
  )
  select
    v_invoice_id,
    we.id,
    we.job_id,
    'Reinforcement subcontract services - ' || coalesce(nullif(j.site_name, ''), nullif(j.title, ''), 'Project scope'),
    we.hours,
    round((we.hours / 10.0), 3),
    p_rate_per_tonne,
    round(round((we.hours / 10.0), 3) * p_rate_per_tonne, 2),
    we.work_date,
    coalesce(nullif(j.location, ''), nullif(j.site_name, ''), 'Project site')
  from public.work_entries we
  join public.jobs j on j.id = we.job_id
  where we.job_id = any(p_project_ids)
    and we.work_date between p_period_start and p_period_end
    and we.hours > 0
    and not exists (
      select 1
      from public.client_invoice_items existing_item
      where existing_item.work_entry_id = we.id
    )
  order by we.work_date, we.job_id, we.worker_id;

  update public.work_entries we
  set
    approved = true,
    approved_by = auth.uid(),
    approved_at = now(),
    locked = true,
    updated_at = now()
  where exists (
    select 1
    from public.client_invoice_items item
    where item.client_invoice_id = v_invoice_id
      and item.work_entry_id = we.id
  );

  return query
  select v_invoice_id, v_invoice_number, v_subtotal, v_gst, v_total, v_entry_count;
end;
$$;

revoke all on function public.create_operations_client_invoice(uuid, uuid[], date, date, numeric, boolean) from public;
grant execute on function public.create_operations_client_invoice(uuid, uuid[], date, date, numeric, boolean) to authenticated;

notify pgrst, 'reload schema';
