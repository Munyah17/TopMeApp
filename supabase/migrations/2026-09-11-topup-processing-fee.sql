-- Wallet top-ups were free to the customer — TopMe absorbed 100% of
-- Paynow/EcoCash/Stripe's own cut on every top-up, on top of the airtime
-- float funding cost. Charging a per-rail processing fee (customer pays
-- amount + fee, wallet is credited `amount`) closes that leak. See
-- src/lib/fees.ts calculateTopupFee() for the rates.
alter table public.topup_intents add column if not exists fee numeric(12,2) not null default 0;

-- Re-declare to carry the fee into the wallet_ledger row for a real audit
-- trail. Everything else (the atomic balance update, the `for update` lock,
-- marking the intent completed) is unchanged from 2026-08-29-atomic-wallet-topup.sql.
create or replace function public.wallet_topup_from_intent(
  p_reference text,
  p_extra_meta jsonb default '{}'
) returns public.wallet_ledger
language plpgsql security definer set search_path = public as $$
declare
  v_intent public.topup_intents;
  v_row    public.wallet_ledger;
begin
  select * into v_intent
    from public.topup_intents
    where reference = p_reference and status = 'pending'
    for update;

  if v_intent is null then
    raise exception 'not_found_or_processed';
  end if;

  insert into public.wallets (user_id, balance)
  values (v_intent.user_id, 0)
  on conflict (user_id) do nothing;

  update public.wallets
    set balance = balance + v_intent.amount, updated_at = now()
    where user_id = v_intent.user_id;

  insert into public.wallet_ledger (user_id, type, amount, provider, reference, status, meta)
  values (
    v_intent.user_id, 'topup', v_intent.amount, v_intent.provider, p_reference, 'success',
    coalesce(v_intent.meta, '{}'::jsonb)
      || jsonb_build_object('fee', coalesce(v_intent.fee, 0), 'charged', v_intent.amount + coalesce(v_intent.fee, 0))
      || coalesce(p_extra_meta, '{}'::jsonb)
  )
  returning * into v_row;

  update public.topup_intents
    set status = 'completed'
    where reference = p_reference;

  return v_row;
end;
$$;
