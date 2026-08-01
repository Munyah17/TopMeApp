-- Peer-to-peer wallet transfers ("Send Money" / "Red Packet") — instant,
-- direct wallet-to-wallet credit between two existing TopMe accounts.
-- Distinct from gift_vouchers: a gift voucher works even if the receiver
-- doesn't have an account yet (redeemed later via a code); a transfer
-- requires the receiver to already be a TopMe user (looked up by phone).

alter type ledger_type add value if not exists 'p2p_send';
alter type ledger_type add value if not exists 'p2p_receive';

create table if not exists public.p2p_transfers (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null references public.profiles(id) on delete cascade,
  receiver_id  uuid not null references public.profiles(id) on delete cascade,
  amount       numeric(12,2) not null,
  kind         text not null default 'transfer' check (kind in ('transfer', 'red_packet')),
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists p2p_transfers_sender_idx on public.p2p_transfers(sender_id, created_at desc);
create index if not exists p2p_transfers_receiver_idx on public.p2p_transfers(receiver_id, created_at desc);

-- Resolve a phone number to the minimal public profile info needed to show
-- a "Sending to <name>" confirmation before money moves. security definer
-- so this works despite profiles' owner-only RLS, but only exposes
-- id/full_name/phone — never email or role.
create or replace function public.find_profile_by_phone(p_phone text)
returns table(id uuid, full_name text, phone text)
language sql stable security definer set search_path = public as $$
  select id, full_name, phone from public.profiles where phone = p_phone limit 1;
$$;
revoke all on function public.find_profile_by_phone(text) from public;
grant execute on function public.find_profile_by_phone(text) to authenticated;

-- Atomic wallet-to-wallet transfer: debits sender, credits receiver, and
-- records both ledger rows + one p2p_transfers row in a single transaction.
-- Both wallet rows are locked in a canonical (user_id) order so two
-- concurrent transfers going in opposite directions can never deadlock.
create or replace function public.wallet_transfer(
  p_receiver_phone text,
  p_amount numeric,
  p_note text default null,
  p_kind text default 'transfer'
) returns public.p2p_transfers
language plpgsql security definer set search_path = public as $$
declare
  v_sender uuid := auth.uid();
  v_receiver uuid;
  v_sender_balance numeric;
  v_first uuid;
  v_second uuid;
  v_xfer public.p2p_transfers;
begin
  if v_sender is null then raise exception 'not_authenticated'; end if;
  if p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if p_kind not in ('transfer', 'red_packet') then raise exception 'invalid_kind'; end if;

  select id into v_receiver from public.profiles where phone = p_receiver_phone;
  if v_receiver is null then raise exception 'recipient_not_found'; end if;
  if v_receiver = v_sender then raise exception 'cannot_pay_self'; end if;

  if v_sender < v_receiver then
    v_first := v_sender; v_second := v_receiver;
  else
    v_first := v_receiver; v_second := v_sender;
  end if;
  perform 1 from public.wallets where user_id = v_first for update;
  perform 1 from public.wallets where user_id = v_second for update;

  select balance into v_sender_balance from public.wallets where user_id = v_sender;
  if v_sender_balance is null then raise exception 'wallet_not_found'; end if;
  if v_sender_balance < p_amount then raise exception 'insufficient_funds'; end if;

  update public.wallets set balance = balance - p_amount, updated_at = now() where user_id = v_sender;
  update public.wallets set balance = balance + p_amount, updated_at = now() where user_id = v_receiver;

  insert into public.wallet_ledger (user_id, type, amount, provider, reference, status, meta)
  values (v_sender, 'p2p_send', -p_amount, 'wallet', public.generate_reference('P2P'), 'success',
    jsonb_build_object('receiver_id', v_receiver, 'kind', p_kind, 'note', p_note));

  insert into public.wallet_ledger (user_id, type, amount, provider, reference, status, meta)
  values (v_receiver, 'p2p_receive', p_amount, 'wallet', public.generate_reference('P2P'), 'success',
    jsonb_build_object('sender_id', v_sender, 'kind', p_kind, 'note', p_note));

  insert into public.p2p_transfers (sender_id, receiver_id, amount, kind, note)
  values (v_sender, v_receiver, p_amount, p_kind, p_note)
  returning * into v_xfer;

  return v_xfer;
end;
$$;
revoke all on function public.wallet_transfer(text, numeric, text, text) from public;
grant execute on function public.wallet_transfer(text, numeric, text, text) to authenticated;

alter table public.p2p_transfers enable row level security;
drop policy if exists p2p_transfers_select_related on public.p2p_transfers;
create policy p2p_transfers_select_related on public.p2p_transfers
  for select using (auth.uid() = sender_id or auth.uid() = receiver_id);
