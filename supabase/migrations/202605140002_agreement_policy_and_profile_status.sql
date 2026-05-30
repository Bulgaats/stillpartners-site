-- Agreement save hardening for contractor auth-mapped workers.
-- Additive/idempotent: does not delete data or rename existing tables.

alter table public.profiles
add column if not exists agreement_version text;

create or replace function public.is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if to_regclass('public.profiles') is null then
    return false;
  end if;

  return exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role::text = 'admin'
      and coalesce(is_active, true)
  );
end;
$$;

create or replace function public.is_worker_auth(target_worker_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workers worker
    where worker.id = target_worker_id
      and worker.auth_user_id = auth.uid()
      and coalesce(worker.account_enabled, true)
  );
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_worker_auth(uuid) to authenticated;

alter table public.subcontractor_agreements enable row level security;

drop policy if exists "subcontractor agreements admin manage" on public.subcontractor_agreements;
create policy "subcontractor agreements admin manage"
on public.subcontractor_agreements
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "subcontractor agreements contractor read own" on public.subcontractor_agreements;
create policy "subcontractor agreements contractor read own"
on public.subcontractor_agreements
for select
to authenticated
using (
  (auth_user_id = auth.uid() and public.is_worker_auth(worker_id))
  or public.is_admin()
);

drop policy if exists "subcontractor agreements contractor insert own" on public.subcontractor_agreements;
create policy "subcontractor agreements contractor insert own"
on public.subcontractor_agreements
for insert
to authenticated
with check (
  auth_user_id = auth.uid()
  and public.is_worker_auth(worker_id)
);

drop policy if exists "subcontractor agreements contractor update own unsigned" on public.subcontractor_agreements;
create policy "subcontractor agreements contractor update own unsigned"
on public.subcontractor_agreements
for update
to authenticated
using (
  auth_user_id = auth.uid()
  and public.is_worker_auth(worker_id)
  and signed_at is null
)
with check (
  auth_user_id = auth.uid()
  and public.is_worker_auth(worker_id)
);

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.subcontractor_agreements to authenticated;

notify pgrst, 'reload schema';
