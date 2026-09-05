-- Real double-credit race, found in a pre-launch audit: every wallet
-- top-up caller (Paynow webhook + manual "Check Payment" poll both calling
-- applyPaynowResult, the Stripe webhook, the EcoCash poll route) did
-- `select ... where status='pending'` as a plain read, then called
-- wallet_topup(), then separately updated topup_intents.status='completed'
-- — three non-atomic steps. Two concurrent deliveries of the same event
-- (a webhook firing at nearly the same moment as the user's own manual
-- poll, or Stripe's own webhook retry behavior) can both pass the pending
-- check before either commits its write, crediting the same top-up twice.
--
-- finalize_guest_payment already gets this right — atomic
-- `select ... for update` + status flip in one transaction. This gives
-- wallet top-ups the same guarantee: the entire pending-check, credit, and
-- status flip happen inside one function call, so a second concurrent
-- caller for the same reference blocks on the row lock, then finds
-- status != 'pending' and raises rather than double-crediting.

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

  -- Merge the intent's own meta (e.g. Paynow's pollUrl, saved at creation)
  -- with whatever the confirming webhook/poll actually returned (e.g. the
  -- raw paynowreference) so the ledger keeps the full audit trail that a
  -- separate, later `update ... set meta = ...` used to provide.
  insert into public.wallet_ledger (user_id, type, amount, provider, reference, status, meta)
  values (v_intent.user_id, 'topup', v_intent.amount, v_intent.provider, p_reference, 'success', coalesce(v_intent.meta, '{}'::jsonb) || coalesce(p_extra_meta, '{}'::jsonb))
  returning * into v_row;

  update public.topup_intents
    set status = 'completed'
    where reference = p_reference;

  return v_row;
end;
$$;
revoke all on function public.wallet_topup_from_intent(text, jsonb) from public;
grant execute on function public.wallet_topup_from_intent(text, jsonb) to service_role;
