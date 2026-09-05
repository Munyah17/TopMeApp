-- Two small hardening fixes found in a launch-readiness pass.

-- 1. chat-images had no file_size_limit and no allowed_mime_types, and its
-- write policy (chat_images_authenticated_write) lets ANY signed-in
-- customer INSERT into it — so any customer could upload an arbitrarily
-- large file of any type, which then serves publicly from TopMe's own
-- storage domain. That's a storage-cost DoS vector and a way to host
-- arbitrary (including malicious or illegal) content under this app's
-- infrastructure. product-images and payment-banners are superadmin-write
-- only, so the exposure is lower there, but the same caps are cheap
-- insurance against a compromised admin account or a future policy change
-- that widens write access.
update storage.buckets set
  file_size_limit = 8 * 1024 * 1024,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif']
where id = 'chat-images';

update storage.buckets set
  file_size_limit = 10 * 1024 * 1024,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/svg+xml']
where id in ('product-images','payment-banners');

-- 2. admin_force_fulfil_transaction had no guard against being run on a
-- transaction that had already been refunded — an admin (or a compromised
-- admin session) could refund a transaction, crediting the wallet back,
-- and then force-fulfil the same transaction, leaving it reading as a
-- normal fulfilled sale with no visible tension against the refund that
-- already happened. The audit log rows for both actions still exist
-- either way, but the transaction's own status shouldn't be able to say
-- "fulfilled" for something already unwound. Force-fulfilling something
-- already fulfilled is left allowed — that's the legitimate retry case
-- (fulfilment silently failed, staff manually confirms it went through).
create or replace function public.admin_force_fulfil_transaction(p_transaction_id uuid, p_note text default null)
returns public.transactions
language plpgsql security definer set search_path = public as $$
declare v_tx public.transactions;
begin
  if not public.has_permission(auth.uid(), 'transactions.rectify') then
    raise exception 'forbidden';
  end if;

  select * into v_tx from public.transactions where id = p_transaction_id;
  if v_tx.id is null then raise exception 'transaction_not_found'; end if;
  if v_tx.status = 'failed' then raise exception 'already_refunded'; end if;

  update public.transactions
    set fulfillment_status = 'fulfilled',
        receipt = receipt || jsonb_build_object('manually_fulfilled_by', auth.uid(), 'note', p_note, 'manually_fulfilled_at', now())
    where id = p_transaction_id
    returning * into v_tx;

  insert into public.admin_audit_log (actor_id, action, target_table, target_id, meta)
    values (auth.uid(), 'transaction.force_fulfil', 'transactions', p_transaction_id::text, jsonb_build_object('note', p_note));
  return v_tx;
end;
$$;
