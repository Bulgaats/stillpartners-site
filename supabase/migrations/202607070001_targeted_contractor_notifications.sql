alter table public.contractor_push_subscriptions
  add column if not exists display_name text,
  add column if not exists device_label text,
  add column if not exists notification_enabled boolean default true,
  add column if not exists last_notified_at timestamptz;

update public.contractor_push_subscriptions
set
  display_name = coalesce(nullif(display_name, ''), 'Unnamed contractor'),
  notification_enabled = coalesce(notification_enabled, true)
where display_name is null
   or display_name = ''
   or notification_enabled is null;

create index if not exists contractor_push_subscriptions_display_name_idx
  on public.contractor_push_subscriptions(display_name);

create index if not exists contractor_push_subscriptions_enabled_idx
  on public.contractor_push_subscriptions(notification_enabled)
  where notification_enabled = true;

create table if not exists public.contractor_notification_events (
  id uuid primary key default gen_random_uuid(),
  message text not null check (char_length(message) <= 50),
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  disabled_count integer not null default 0,
  created_at timestamptz default now()
);

alter table public.contractor_notification_events enable row level security;

drop policy if exists "contractor notification events service role only" on public.contractor_notification_events;
create policy "contractor notification events service role only"
  on public.contractor_notification_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create table if not exists public.contractor_notification_event_recipients (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.contractor_notification_events(id) on delete cascade,
  subscription_id uuid references public.contractor_push_subscriptions(id) on delete set null,
  display_name text,
  delivery_status text not null check (delivery_status in ('sent', 'failed', 'disabled')),
  error_message text,
  created_at timestamptz default now()
);

alter table public.contractor_notification_event_recipients enable row level security;

drop policy if exists "contractor notification event recipients service role only" on public.contractor_notification_event_recipients;
create policy "contractor notification event recipients service role only"
  on public.contractor_notification_event_recipients
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create index if not exists contractor_notification_recipients_event_id_idx
  on public.contractor_notification_event_recipients(event_id);

create index if not exists contractor_notification_recipients_subscription_id_idx
  on public.contractor_notification_event_recipients(subscription_id);
