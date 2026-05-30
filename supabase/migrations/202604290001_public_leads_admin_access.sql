-- Enables internal admin users to read and update public website leads.
-- Safe before or after the full internal dashboard schema is applied.

create or replace function public.is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result boolean;
begin
  if to_regclass('public.profiles') is null then
    return false;
  end if;

  execute
    'select exists (
       select 1
       from public.profiles
       where id = $1
         and role::text = ''admin''
     )'
    into result
    using auth.uid();

  return coalesce(result, false);
end;
$$;

drop policy if exists "subcontractor applications admin all" on public.subcontractor_applications;
create policy "subcontractor applications admin all"
on public.subcontractor_applications
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "client requests admin all" on public.client_requests;
create policy "client requests admin all"
on public.client_requests
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "contact messages admin all" on public.contact_messages;
create policy "contact messages admin all"
on public.contact_messages
for all
using (public.is_admin())
with check (public.is_admin());

grant select, update on public.subcontractor_applications to authenticated;
grant select, update on public.client_requests to authenticated;
grant select, update on public.contact_messages to authenticated;

notify pgrst, 'reload schema';
