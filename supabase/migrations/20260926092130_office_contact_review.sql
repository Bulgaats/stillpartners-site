-- Preserve source contact observations separately from confirmed directory entries.
create table public.office_contact_imports (
  id uuid primary key default gen_random_uuid(),
  source_system text not null check (source_system='mac_invoice_register'),
  source_key text not null check (length(source_key) between 1 and 300),
  source_digest text not null check (source_digest ~ '^[a-f0-9]{64}$'),
  source_data jsonb not null check (jsonb_typeof(source_data)='object'),
  status text not null default 'pending' check (status in ('pending','created','linked','dismissed')),
  worker_id uuid references public.workers(id) on delete restrict,
  imported_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  review_note text,
  unique(source_system,source_key,source_digest),
  check ((status='pending' and worker_id is null and reviewed_at is null and reviewed_by is null and review_note is null)
    or (status<>'pending' and reviewed_at is not null and reviewed_by is not null and review_note is not null and length(btrim(review_note))>=3
      and ((status in ('created','linked') and worker_id is not null) or (status='dismissed' and worker_id is null))))
);
create index office_contact_imports_worker on public.office_contact_imports(worker_id);
create index office_contact_imports_reviewer on public.office_contact_imports(reviewed_by);
alter table public.office_contact_imports enable row level security;
revoke all on public.office_contact_imports from anon,authenticated;
grant select,insert,update on public.office_contact_imports to authenticated;
grant all on public.office_contact_imports to service_role;
create policy "Finance admins review imported contacts" on public.office_contact_imports for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create function public.office_contact_source_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if old.status<>'pending' or new.status='pending'
    or (to_jsonb(new)-array['status','worker_id','reviewed_at','reviewed_by','review_note'])
      is distinct from (to_jsonb(old)-array['status','worker_id','reviewed_at','reviewed_by','review_note']) then
    raise exception 'Original contact observations and completed reviews are retained unchanged';
  end if;
  if auth.uid() is null or new.reviewed_by is distinct from auth.uid() then raise exception 'Reviewer must be the signed-in admin'; end if;
  return new;
end $$;
revoke all on function public.office_contact_source_guard() from public,anon,authenticated;
create trigger office_contact_source_immutable before update on public.office_contact_imports
  for each row execute function public.office_contact_source_guard();
create trigger office_contact_review_audit after update on public.office_contact_imports
  for each row execute function public.office_audit_change();

create function public.office_resolve_contact_import(
  p_import uuid,p_action text,p_note text,p_worker uuid default null,p_contact jsonb default null
) returns uuid language plpgsql security invoker set search_path='' as $$
declare item public.office_contact_imports%rowtype; result_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Finance admin access required'; end if;
  if p_action is null or p_action not in ('create','link','dismiss') or length(btrim(coalesce(p_note,''))) not between 3 and 2000 then
    raise exception 'Choose an action and explain the contact review';
  end if;
  select * into item from public.office_contact_imports where id=p_import for update;
  if not found then raise exception 'Imported contact not found'; end if;
  if item.status<>'pending' then raise exception 'This source was already reviewed. Reload to see the result'; end if;
  if p_action='link' then
    if not exists(select 1 from public.workers where id=p_worker) then raise exception 'Choose an existing contractor'; end if;
    result_id:=p_worker;
  elsif p_action='create' then
    if p_contact is null or length(btrim(coalesce(p_contact->>'fullName',''))) not between 2 and 160
      or coalesce(p_contact->>'group','') not in ('regular','occasional')
      or length(coalesce(p_contact->>'email',''))>254 or length(coalesce(p_contact->>'phone',''))>40 then
      raise exception 'Check contractor name, group and contact details';
    end if;
    if coalesce(p_contact->>'email','')<>'' and p_contact->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Check the email address'; end if;
    perform pg_advisory_xact_lock(hashtextextended('office-contact-import:'||lower(btrim(p_contact->>'fullName'))||':'||regexp_replace(coalesce(p_contact->>'abn',''),'\s','','g'),0));
    result_id:=public.office_save_contractor(null,p_contact->>'fullName',p_contact->>'email',p_contact->>'phone',
      p_contact->>'abn',p_contact->>'group',coalesce((p_contact->>'active')::boolean,true));
  end if;
  update public.office_contact_imports set status=case p_action when 'create' then 'created' when 'link' then 'linked' else 'dismissed' end,
    worker_id=result_id,reviewed_at=clock_timestamp(),reviewed_by=auth.uid(),review_note=btrim(p_note) where id=p_import;
  return result_id;
end $$;
revoke all on function public.office_resolve_contact_import(uuid,text,text,uuid,jsonb) from public,anon;
grant execute on function public.office_resolve_contact_import(uuid,text,text,uuid,jsonb) to authenticated;
