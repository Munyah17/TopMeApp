-- Lets a logged-in user pay a specific purchase directly via Paynow/Stripe/
-- EcoCash instead of their wallet, while still being properly attributed
-- (not treated as an anonymous guest) — the checkout intent now remembers
-- who they are, and finalize_guest_payment carries that onto the resulting
-- transaction instead of always inserting a null user_id.

alter table public.guest_checkout_intents add column if not exists user_id uuid references public.profiles(id);

create or replace function public.finalize_guest_payment(
  p_reference text,
  p_fulfillment_provider text default 'simulated'
) returns public.transactions
language plpgsql security definer set search_path = public as $$
declare
  v_intent        public.guest_checkout_intents;
  v_tx            public.transactions;
  v_reference     text;
  v_cost_pct      numeric;
  v_owner_label   text;
  v_provider_cost numeric;
begin
  select * into v_intent
    from public.guest_checkout_intents
    where reference = p_reference and status = 'pending'
    for update;

  if v_intent is null then
    raise exception 'not_found_or_processed';
  end if;

  select cost_percentage, provider_label into v_cost_pct, v_owner_label
    from public.services where id = v_intent.service_id;
  v_provider_cost := round(v_intent.amount * coalesce(v_cost_pct, 0) / 100, 2);

  v_reference := public.generate_reference('TPM');

  insert into public.transactions (
    user_id, guest_email, guest_phone, service_id, network_id, recipient_identifier, extra_value,
    amount, fee, status, reference, fulfillment_provider, fulfillment_status,
    provider_cost, owner_label
  ) values (
    v_intent.user_id, v_intent.guest_email, v_intent.guest_phone, v_intent.service_id, v_intent.network_id,
    v_intent.recipient_identifier, v_intent.extra_value,
    v_intent.amount, v_intent.fee, 'success', v_reference, p_fulfillment_provider, 'pending',
    v_provider_cost, v_owner_label
  ) returning * into v_tx;

  update public.guest_checkout_intents
    set status = 'completed', transaction_id = v_tx.id
    where reference = p_reference;

  return v_tx;
end;
$$;
revoke all on function public.finalize_guest_payment(text, text) from public;
grant execute on function public.finalize_guest_payment(text, text) to service_role;
