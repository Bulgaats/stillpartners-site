-- Add a non-financial admin role for daily operational records.
-- Production currently stores profile roles as text, while older installations
-- may still use the app_role enum. Support both shapes safely.

do $$
declare
  v_role_udt text;
begin
  select c.udt_name
  into v_role_udt
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'profiles'
    and c.column_name = 'role';

  if v_role_udt = 'app_role' then
    execute 'alter type public.app_role add value if not exists ''operations_admin''';
  elsif v_role_udt in ('text', 'varchar') then
    if not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.profiles'::regclass
        and conname = 'profiles_role_allowed_check'
    ) then
      alter table public.profiles
        add constraint profiles_role_allowed_check
        check (role in ('worker', 'leading_hand', 'operations_admin', 'admin')) not valid;
    end if;
  else
    raise exception 'Unsupported public.profiles.role type: %', coalesce(v_role_udt, 'missing');
  end if;
end $$;

notify pgrst, 'reload schema';
