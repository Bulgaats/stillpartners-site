-- Add a non-financial admin role for daily operational records.
-- Keep this enum change in its own migration so PostgreSQL can commit the new
-- enum value before later policies and functions use it.

alter type public.app_role add value if not exists 'operations_admin';

notify pgrst, 'reload schema';
