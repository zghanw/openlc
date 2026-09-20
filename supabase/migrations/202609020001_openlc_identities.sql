create table if not exists public.openlc_accounts (
  id uuid primary key default gen_random_uuid(),
  supabase_user_id uuid unique references auth.users(id) on delete set null,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (supabase_user_id is not null or email is null)
);

create table if not exists public.openlc_wallet_identities (
  address text primary key check (address ~ '^0x[0-9a-fA-F]{40}$'),
  account_id uuid not null references public.openlc_accounts(id) on delete cascade,
  verified_at timestamptz not null default now(),
  unique (account_id)
);

create table if not exists public.wallet_auth_challenges (
  id uuid primary key,
  address text not null check (address ~ '^0x[0-9a-fA-F]{40}$'),
  message text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists openlc_wallet_identities_account_idx on public.openlc_wallet_identities (account_id);
create index if not exists wallet_challenge_expiry_idx on public.wallet_auth_challenges (expires_at) where used_at is null;

alter table public.openlc_accounts enable row level security;
alter table public.openlc_wallet_identities enable row level security;
alter table public.wallet_auth_challenges enable row level security;

revoke all on public.openlc_accounts, public.openlc_wallet_identities, public.wallet_auth_challenges from public, anon, authenticated;
grant select on public.openlc_accounts, public.openlc_wallet_identities to authenticated;

drop policy if exists "users can read their PayProof account" on public.openlc_accounts;
create policy "users can read their PayProof account" on public.openlc_accounts
for select to authenticated using (supabase_user_id = auth.uid());

drop policy if exists "users can read their Sui identities" on public.openlc_wallet_identities;
create policy "users can read their wallet identities" on public.openlc_wallet_identities
for select to authenticated using (
  exists (
    select 1 from public.openlc_accounts account
    where account.id = account_id and account.supabase_user_id = auth.uid()
  )
);

create or replace function public.resolve_supabase_account(
  p_supabase_user_id uuid,
  p_email text,
  p_display_name text
) returns public.openlc_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare result public.openlc_accounts;
begin
  insert into public.openlc_accounts (supabase_user_id, email, display_name)
  values (p_supabase_user_id, p_email, p_display_name)
  on conflict (supabase_user_id) do update
  set email = excluded.email,
      display_name = excluded.display_name,
      updated_at = now()
  returning * into result;
  return result;
end;
$$;

create or replace function public.resolve_wallet_account(p_address text)
returns public.openlc_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare result public.openlc_accounts;
begin
  select account.* into result
  from public.openlc_accounts account
  join public.openlc_wallet_identities identity on identity.account_id = account.id
  where identity.address = p_address;
  if found then return result; end if;

  insert into public.openlc_accounts default values returning * into result;
  insert into public.openlc_wallet_identities (address, account_id)
  values (p_address, result.id);
  return result;
end;
$$;

create or replace function public.link_wallet_identity(
  p_account_id uuid,
  p_address text
) returns public.openlc_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare result public.openlc_accounts;
begin
  insert into public.openlc_wallet_identities (address, account_id)
  values (p_address, p_account_id)
  on conflict (account_id) do update
  set address = excluded.address,
      verified_at = now();
  select * into result from public.openlc_accounts where id = p_account_id;
  return result;
end;
$$;

create or replace function public.consume_wallet_challenge(p_id uuid, p_used_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.wallet_auth_challenges
  set used_at = p_used_at
  where id = p_id and used_at is null and expires_at > p_used_at;
  return found;
end;
$$;

revoke all on function public.resolve_supabase_account(uuid, text, text) from public, anon, authenticated;
revoke all on function public.resolve_wallet_account(text) from public, anon, authenticated;
revoke all on function public.link_wallet_identity(uuid, text) from public, anon, authenticated;
revoke all on function public.consume_wallet_challenge(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.resolve_supabase_account(uuid, text, text) to service_role;
grant execute on function public.resolve_wallet_account(text) to service_role;
grant execute on function public.link_wallet_identity(uuid, text) to service_role;
grant execute on function public.consume_wallet_challenge(uuid, timestamptz) to service_role;

drop policy if exists "trade parties can read" on public.trade_orders;
create policy "trade parties can read" on public.trade_orders
for select to authenticated using (
  exists (
    select 1 from public.openlc_accounts account
    where account.supabase_user_id = auth.uid()
      and account.id::text in (buyer_id, supplier_id, arbitrator_id)
  )
);

comment on table public.openlc_accounts is 'Stable OpenLC account shared by Supabase and verified wallet identity paths.';
comment on table public.openlc_wallet_identities is 'Verified EVM wallet addresses mapped to OpenLC accounts.';
comment on table public.wallet_auth_challenges is 'Short-lived, single-use challenges for EVM wallet ownership verification.';
