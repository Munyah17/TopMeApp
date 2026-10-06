-- BillPay gateway checkout intents and atomic finalization.
create table if not exists public.billpay_checkout_intents (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,
  user_id uuid not null references public.profiles(id),
  application jsonb not null,
  amount numeric(12,2) not null check (amount > 0),
  fee numeric(12,2) not null default 0,
  provider text not null check (provider in ('paynow','stripe','ecocash')),
  status text not null default 'pending' check (status in ('pending','completed','failed')),
  transaction_id uuid references public.transactions(id),
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists billpay_checkout_intents_reference_idx on public.billpay_checkout_intents(reference);
alter table public.billpay_checkout_intents enable row level security;

create or replace function public.finalize_billpay_checkout(p_reference text)
returns public.transactions
language plpgsql security definer set search_path = public as $$
declare
  v_intent public.billpay_checkout_intents;
  v_tx public.transactions;
  v_reference text;
begin
  select * into v_intent from public.billpay_checkout_intents
    where reference = p_reference and status = 'pending' for update;
  if v_intent is null then raise exception 'not_found_or_processed'; end if;
  v_reference := public.generate_reference('TPM');
  insert into public.transactions (
    user_id, service_id, recipient_identifier, extra_value,
    amount, fee, status, reference, fulfillment_provider, fulfillment_status,
    provider_cost, owner_label
  ) values (
    v_intent.user_id, 'billpay-' || lower(v_intent.application->>'billerCode'),
    v_intent.application->>'memberNumber', v_intent.application::text,
    v_intent.amount, v_intent.fee, 'success', v_reference, 'billpay', 'pending',
    v_intent.amount, v_intent.application->>'billerName'
  ) returning * into v_tx;
  update public.billpay_checkout_intents set status = 'completed', transaction_id = v_tx.id
    where reference = p_reference;
  return v_tx;
end;
$$;
revoke all on function public.finalize_billpay_checkout(text) from public;
grant execute on function public.finalize_billpay_checkout(text) to service_role;

create or replace function public.fail_billpay_checkout(p_reference text)
returns void language sql security definer set search_path = public as $$
  update public.billpay_checkout_intents set status = 'failed'
    where reference = p_reference and status = 'pending';
$$;
revoke all on function public.fail_billpay_checkout(text) from public;
grant execute on function public.fail_billpay_checkout(text) to service_role;

create or replace function public.get_billpay_checkout(p_reference text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_intent public.billpay_checkout_intents;
  v_tx public.transactions;
begin
  select * into v_intent from public.billpay_checkout_intents where reference = p_reference;
  if v_intent is null then return jsonb_build_object('status', 'not_found'); end if;
  if v_intent.status = 'completed' and v_intent.transaction_id is not null then
    select * into v_tx from public.transactions where id = v_intent.transaction_id;
    return jsonb_build_object(
      'status', 'completed',
      'transaction', jsonb_build_object(
        'reference', v_tx.reference, 'amount', v_tx.amount, 'fee', v_tx.fee,
        'service_name', coalesce(v_intent.application->>'billerName','BillPay') || ' — ' || coalesce(v_intent.application->>'productName',''),
        'recipient', v_tx.recipient_identifier,
        'fulfillment_status', v_tx.fulfillment_status,
        'created_at', v_tx.created_at
      )
    );
  end if;
  return jsonb_build_object('status', v_intent.status);
end;
$$;
revoke all on function public.get_billpay_checkout(text) from public;
grant execute on function public.get_billpay_checkout(text) to anon, authenticated;
