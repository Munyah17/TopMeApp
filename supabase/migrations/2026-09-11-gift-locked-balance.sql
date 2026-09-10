-- ═══════════════════════════════════════════════════════════════════════
--  Gift-voucher balance is ring-fenced from cash-out.
--
--  wallets.gift_locked (added in 2026-09-10-withdrawals.sql) tracks the
--  portion of the balance that originated from a redeemed gift voucher.
--  request_withdrawal already refuses to let balance drop below it.
--
--  Maintained two ways, without touching the core payment RPCs:
--   * wallet_gift_redeem adds the voucher amount to gift_locked.
--   * a BEFORE UPDATE trigger clamps gift_locked into [0, balance] on every
--     wallet write — so any spend (a service payment, a send, a debit
--     adjustment) that pulls the balance down drags gift_locked with it,
--     i.e. gift money is spent before it would ever block a withdrawal,
--     and it's impossible for gift_locked to exceed the real balance.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.clamp_gift_locked() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.gift_locked is null then new.gift_locked := 0; end if;
  if new.gift_locked < 0 then new.gift_locked := 0; end if;
  if new.gift_locked > new.balance then new.gift_locked := greatest(new.balance, 0); end if;
  return new;
end;
$$;

drop trigger if exists wallets_clamp_gift_locked on public.wallets;
create trigger wallets_clamp_gift_locked
  before insert or update on public.wallets
  for each row execute function public.clamp_gift_locked();

-- Bump gift_locked when a voucher is redeemed. (Body otherwise identical to
-- the original in schema.sql.)
create or replace function public.wallet_gift_redeem(p_code text)
returns public.gift_vouchers
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_voucher public.gift_vouchers;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;

  select * into v_voucher from public.gift_vouchers where code = p_code for update;
  if v_voucher.id is null then raise exception 'voucher_not_found'; end if;
  if v_voucher.status <> 'active' then raise exception 'voucher_already_redeemed'; end if;

  update public.wallets
    set balance = balance + v_voucher.amount,
        gift_locked = coalesce(gift_locked, 0) + v_voucher.amount,
        updated_at = now()
    where user_id = v_user;

  insert into public.wallet_ledger (user_id, type, amount, provider, reference, status)
  values (v_user, 'gift_redeem', v_voucher.amount, 'wallet', p_code, 'success');

  update public.gift_vouchers
    set status = 'redeemed', redeemed_at = now(), redeemed_by = v_user
    where code = p_code
    returning * into v_voucher;

  return v_voucher;
end;
$$;

-- Backfill: lock the still-unspent value of every gift voucher already
-- redeemed, capped at the wallet's current balance.
update public.wallets w set gift_locked = least(
  w.balance,
  coalesce((select sum(v.amount) from public.gift_vouchers v
            where v.redeemed_by = w.user_id and v.status = 'redeemed'), 0)
);
