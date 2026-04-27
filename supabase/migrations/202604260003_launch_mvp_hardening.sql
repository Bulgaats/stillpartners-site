do $$
begin
  create type public.email_status as enum ('not_sent', 'queued', 'sent', 'failed');
exception
  when duplicate_object then null;
end $$;

alter table public.worker_invoices
add column if not exists sent_at timestamptz,
add column if not exists email_status public.email_status not null default 'not_sent',
add column if not exists due_on date,
add column if not exists notes text;

alter table public.client_invoices
add column if not exists sent_at timestamptz,
add column if not exists email_status public.email_status not null default 'not_sent',
add column if not exists due_on date,
add column if not exists notes text;

create table if not exists public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role public.app_role not null,
  invited_by uuid references public.profiles(id) on delete set null,
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email)
);

drop trigger if exists user_invitations_updated_at on public.user_invitations;
create trigger user_invitations_updated_at before update on public.user_invitations
for each row execute function public.set_updated_at();

alter table public.user_invitations enable row level security;

create policy "user invitations admin manage" on public.user_invitations
for all using (public.is_admin()) with check (public.is_admin());

create policy "user invitations invited user read" on public.user_invitations
for select using (lower(email) = lower((auth.jwt() ->> 'email')));

create index if not exists user_invitations_email_idx on public.user_invitations(lower(email));
create index if not exists worker_invoices_email_status_idx on public.worker_invoices(email_status, sent_at);
create index if not exists client_invoices_email_status_idx on public.client_invoices(email_status, sent_at);
