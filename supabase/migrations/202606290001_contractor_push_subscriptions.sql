create table if not exists public.contractor_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz default now(),
  last_seen_at timestamptz default now()
);

alter table public.contractor_push_subscriptions enable row level security;

drop policy if exists "contractor push subscriptions service role only" on public.contractor_push_subscriptions;
create policy "contractor push subscriptions service role only"
  on public.contractor_push_subscriptions
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create index if not exists contractor_push_subscriptions_last_seen_at_idx
  on public.contractor_push_subscriptions(last_seen_at);
