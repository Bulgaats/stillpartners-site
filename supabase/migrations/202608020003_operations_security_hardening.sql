-- Restrict operations SECURITY DEFINER helpers to signed-in users only.
-- Supabase may grant anon explicitly through default privileges, so revoke both
-- PUBLIC and anon before granting the intended authenticated access.

revoke all privileges on function public.is_operations_admin() from public, anon;
revoke all privileges on function public.can_access_operations() from public, anon;
revoke all privileges on function public.create_operations_client_invoice(uuid, uuid[], date, date, numeric, boolean) from public, anon;

grant execute on function public.is_operations_admin() to authenticated;
grant execute on function public.can_access_operations() to authenticated;
grant execute on function public.create_operations_client_invoice(uuid, uuid[], date, date, numeric, boolean) to authenticated;

create index if not exists client_invoices_client_id_idx
on public.client_invoices(client_id);

create index if not exists user_invitations_invited_by_idx
on public.user_invitations(invited_by);

create index if not exists user_invitations_accepted_by_idx
on public.user_invitations(accepted_by);

notify pgrst, 'reload schema';
