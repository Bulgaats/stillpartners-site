-- Keep finance invoice creation behind the server-side service role.
-- The server action verifies the finance session and passes the actor ID.

grant select, insert, update, delete on public.client_worker_rates to service_role;

drop function if exists public.create_operations_client_invoice(
  uuid,
  uuid[],
  date,
  date,
  jsonb,
  boolean
);

create or replace function public.create_operations_client_invoice(
  p_client_id uuid,
  p_project_ids uuid[],
  p_period_start date,
  p_period_end date,
  p_worker_rates jsonb,
  p_actor_id uuid,
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
security invoker
set search_path = ''
as $$
declare
  v_invoice_id uuid;
  v_invoice_number text;
  v_subtotal numeric(12,2);
  v_gst numeric(12,2);
  v_total numeric(12,2);
  v_total_tonnes numeric(12,3);
  v_entry_count integer;
  v_worker_count integer;
  v_provided_rate_count integer;
  v_distinct_rate_count integer;
  v_single_rate numeric(12,2);
  v_sequence bigint;
  v_payment_terms integer;
begin
  if not exists (
    select 1
    from public.profiles profile
    where profile.id = p_actor_id
      and profile.role::text = 'admin'
      and coalesce(profile.is_active, true)
  ) then
    raise exception 'Finance admin access required.' using errcode = '42501';
  end if;

  if p_client_id is null
    or coalesce(array_length(p_project_ids, 1), 0) = 0
    or p_period_start is null
    or p_period_end is null
    or p_period_end < p_period_start then
    raise exception 'Client, project and valid invoice period are required.';
  end if;

  if p_worker_rates is null or jsonb_typeof(p_worker_rates) is distinct from 'array' then
    raise exception 'Contractor billing rates must be supplied as a list.';
  end if;

  if jsonb_array_length(p_worker_rates) = 0 then
    raise exception 'At least one contractor billing rate is required.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_worker_rates) as rate_input(
      worker_id uuid,
      rate_per_tonne numeric
    )
    where rate_input.worker_id is null
      or coalesce(rate_input.rate_per_tonne, 0) <= 0
  ) then
    raise exception 'Every contractor must have a positive client billing rate.';
  end if;

  select count(*), count(distinct rate_input.worker_id)
  into v_provided_rate_count, v_worker_count
  from jsonb_to_recordset(p_worker_rates) as rate_input(
    worker_id uuid,
    rate_per_tonne numeric
  );

  if v_provided_rate_count is distinct from v_worker_count then
    raise exception 'Each contractor may have only one client billing rate.';
  end if;

  if exists (
    select 1
    from unnest(p_project_ids) selected_project_id
    left join public.jobs j on j.id = selected_project_id
    where j.id is null or j.client_id is distinct from p_client_id
  ) then
    raise exception 'Every selected project must belong to the selected client.';
  end if;

  select coalesce(c.payment_terms_days, 14)
  into v_payment_terms
  from public.clients c
  where c.id = p_client_id
    and coalesce(c.is_active, true);

  if v_payment_terms is null then
    raise exception 'The selected client is inactive or unavailable.';
  end if;

  select count(distinct we.worker_id)
  into v_worker_count
  from public.work_entries we
  where we.job_id = any(p_project_ids)
    and we.work_date between p_period_start and p_period_end
    and we.hours > 0
    and not we.approved
    and not we.locked
    and not exists (
      select 1
      from public.client_invoice_items existing_item
      where existing_item.work_entry_id = we.id
    );

  if coalesce(v_worker_count, 0) = 0 then
    raise exception 'No uninvoiced production records were found for this selection.';
  end if;

  if v_worker_count is distinct from v_provided_rate_count
    or exists (
      select distinct we.worker_id
      from public.work_entries we
      where we.job_id = any(p_project_ids)
        and we.work_date between p_period_start and p_period_end
        and we.hours > 0
        and not we.approved
        and not we.locked
        and not exists (
          select 1
          from public.client_invoice_items existing_item
          where existing_item.work_entry_id = we.id
        )
      except
      select rate_input.worker_id
      from jsonb_to_recordset(p_worker_rates) as rate_input(
        worker_id uuid,
        rate_per_tonne numeric
      )
    ) then
    raise exception 'A billing rate is required for every contractor in this invoice.';
  end if;

  with rate_input as (
    select rate.worker_id, rate.rate_per_tonne
    from jsonb_to_recordset(p_worker_rates) as rate(
      worker_id uuid,
      rate_per_tonne numeric
    )
  )
  select
    count(*)::integer,
    round(sum(round((we.hours / 10.0), 3)), 3),
    round(sum(round(round((we.hours / 10.0), 3) * rate_input.rate_per_tonne, 2)), 2),
    count(distinct rate_input.rate_per_tonne)::integer,
    min(rate_input.rate_per_tonne)
  into
    v_entry_count,
    v_total_tonnes,
    v_subtotal,
    v_distinct_rate_count,
    v_single_rate
  from public.work_entries we
  join rate_input on rate_input.worker_id = we.worker_id
  where we.job_id = any(p_project_ids)
    and we.work_date between p_period_start and p_period_end
    and we.hours > 0
    and not we.approved
    and not we.locked
    and not exists (
      select 1
      from public.client_invoice_items existing_item
      where existing_item.work_entry_id = we.id
    );

  v_total_tonnes := coalesce(v_total_tonnes, 0);
  v_subtotal := coalesce(v_subtotal, 0);
  v_gst := case when p_gst_applied then round(v_subtotal * 0.10, 2) else 0 end;
  v_total := v_subtotal + v_gst;
  v_sequence := nextval('public.client_invoice_sequence');
  v_invoice_number := 'CINV-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(v_sequence::text, 4, '0');

  insert into public.client_worker_rates (
    client_id,
    worker_id,
    rate_per_tonne,
    created_by,
    updated_by
  )
  select
    p_client_id,
    rate_input.worker_id,
    rate_input.rate_per_tonne,
    p_actor_id,
    p_actor_id
  from jsonb_to_recordset(p_worker_rates) as rate_input(
    worker_id uuid,
    rate_per_tonne numeric
  )
  on conflict (client_id, worker_id) do update
  set
    rate_per_tonne = excluded.rate_per_tonne,
    updated_by = p_actor_id,
    updated_at = now();

  insert into public.client_invoices (
    client_id,
    invoice_number,
    status,
    period_start,
    period_end,
    payment_status,
    subtotal,
    gst,
    gst_amount,
    total,
    total_amount,
    rate_per_tonne,
    total_tonnes,
    gst_applied,
    local_archive_status,
    due_on,
    notes,
    created_by
  ) values (
    p_client_id,
    v_invoice_number,
    'draft',
    p_period_start,
    p_period_end,
    'unpaid',
    v_subtotal,
    v_gst,
    v_gst,
    v_total,
    v_total,
    case when v_distinct_rate_count = 1 then v_single_rate else 0 end,
    v_total_tonnes,
    p_gst_applied,
    'pending',
    current_date + v_payment_terms,
    'Generated from operational records using contractor-specific client billing rates.',
    p_actor_id
  ) returning id into v_invoice_id;

  with rate_input as (
    select rate.worker_id, rate.rate_per_tonne
    from jsonb_to_recordset(p_worker_rates) as rate(
      worker_id uuid,
      rate_per_tonne numeric
    )
  )
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
    rate_input.rate_per_tonne,
    round(round((we.hours / 10.0), 3) * rate_input.rate_per_tonne, 2),
    we.work_date,
    coalesce(nullif(j.location, ''), nullif(j.site_name, ''), 'Project site')
  from public.work_entries we
  join public.jobs j on j.id = we.job_id
  join rate_input on rate_input.worker_id = we.worker_id
  where we.job_id = any(p_project_ids)
    and we.work_date between p_period_start and p_period_end
    and we.hours > 0
    and not we.approved
    and not we.locked
    and not exists (
      select 1
      from public.client_invoice_items existing_item
      where existing_item.work_entry_id = we.id
    )
  order by rate_input.rate_per_tonne desc, we.work_date, we.job_id, we.worker_id;

  update public.work_entries we
  set
    approved = true,
    approved_by = p_actor_id,
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

revoke all privileges on function public.create_operations_client_invoice(
  uuid,
  uuid[],
  date,
  date,
  jsonb,
  uuid,
  boolean
) from public, anon, authenticated;

grant execute on function public.create_operations_client_invoice(
  uuid,
  uuid[],
  date,
  date,
  jsonb,
  uuid,
  boolean
) to service_role;

notify pgrst, 'reload schema';
