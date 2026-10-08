-- Where order notifications are emailed. Typed by the user and never verified, so it is kept
-- apart from openlc_accounts.email, which the API treats as a verified identity.
alter table public.openlc_accounts
  add column if not exists notification_email text
  check (notification_email is null or notification_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$');

create table if not exists public.openlc_notifications (
  id uuid primary key,
  account_id uuid not null references public.openlc_accounts(id) on delete cascade,
  order_id uuid not null references public.trade_orders(id) on delete cascade,
  kind text not null check (kind in ('order_accepted')),
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  -- One notification per account, order and kind: a repeated accept cannot notify twice.
  unique (account_id, order_id, kind)
);

create index if not exists openlc_notifications_account_created_idx
  on public.openlc_notifications (account_id, created_at desc);

alter table public.openlc_notifications enable row level security;
revoke all on public.openlc_notifications from public, anon, authenticated;
