alter table public.contractor_push_subscriptions
  add column if not exists phone_hash text,
  add column if not exists phone_last4 text;

create index if not exists contractor_push_subscriptions_phone_hash_idx
  on public.contractor_push_subscriptions(phone_hash)
  where phone_hash is not null;

create index if not exists contractor_push_subscriptions_phone_last4_idx
  on public.contractor_push_subscriptions(phone_last4)
  where phone_last4 is not null;
