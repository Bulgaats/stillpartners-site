-- Harden invoice duplicate prevention at the database layer.
-- Safe/idempotent: this migration only adds partial unique indexes after
-- confirming existing non-null work_entry_id values are already unique.
-- It does not delete, update, rename, or rewrite existing invoice data.

do $$
declare
  duplicate_count integer;
begin
  select count(*)
  into duplicate_count
  from (
    select work_entry_id
    from public.worker_invoice_items
    where work_entry_id is not null
    group by work_entry_id
    having count(*) > 1
  ) duplicates;

  if duplicate_count > 0 then
    raise exception
      'Cannot add worker_invoice_items work_entry_id unique index: % duplicate non-null work_entry_id value(s) exist. Resolve data manually first.',
      duplicate_count;
  end if;
end $$;

do $$
declare
  duplicate_count integer;
begin
  select count(*)
  into duplicate_count
  from (
    select work_entry_id
    from public.client_invoice_items
    where work_entry_id is not null
    group by work_entry_id
    having count(*) > 1
  ) duplicates;

  if duplicate_count > 0 then
    raise exception
      'Cannot add client_invoice_items work_entry_id unique index: % duplicate non-null work_entry_id value(s) exist. Resolve data manually first.',
      duplicate_count;
  end if;
end $$;

do $$
begin
  -- Preserve the earlier contractor unique index name if it already exists.
  if to_regclass('public.worker_invoice_items_work_entry_uidx') is null
     and to_regclass('public.worker_invoice_items_work_entry_unique_idx') is null then
    execute 'create unique index worker_invoice_items_work_entry_unique_idx
      on public.worker_invoice_items(work_entry_id)
      where work_entry_id is not null';
  end if;
end $$;

create unique index if not exists client_invoice_items_work_entry_unique_idx
on public.client_invoice_items(work_entry_id)
where work_entry_id is not null;

notify pgrst, 'reload schema';
