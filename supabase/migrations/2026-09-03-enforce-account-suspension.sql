-- Account suspension was cosmetic. `profiles.is_suspended` is set by
-- toggleAccountSuspension and rendered in the admin customer list, and that
-- is the entire extent of it: the middleware never reads it, no RLS policy
-- references it, and no money function checks it. A suspended customer kept
-- full access — log in, top up, pay, transfer — so the button staff would
-- reach for while a fraud case is open did nothing at all.
--
-- Worse, they could clear it themselves. prevent_role_self_escalation()
-- guards `role` only, and profiles_update_own lets a user UPDATE their own
-- row, so `update profiles set is_suspended = false` from the browser was a
-- one-liner.

-- ── 1. A suspended user can't lift their own suspension ──────────────────
-- Same shape as the existing role guard: silently restore the old value for
-- anyone who isn't service_role, rather than raising — an error here would
-- leak that the column is what's being enforced.
create or replace function public.prevent_role_self_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then
    if new.role is distinct from old.role then
      new.role := old.role;
    end if;
    if new.is_suspended is distinct from old.is_suspended then
      new.is_suspended := old.is_suspended;
    end if;
  end if;
  return new;
end;
$$;

-- ── 2. A suspended user can't move money ────────────────────────────────
-- Enforced at the two tables every money path must write through, rather
-- than inside each of wallet_pay / wallet_transfer / wallet_gift_send: a
-- table-level guard can't be forgotten when the next money function is
-- added, and it holds even though those functions are SECURITY DEFINER.
--
-- Keyed on the *actor* (auth.uid()), not on the row's user_id, so that
-- staff can still refund or adjust a suspended customer's wallet — the
-- admin is the actor there, and they aren't suspended. Service-role callers
-- (gateway webhooks, fulfilment, guest checkout) have no auth.uid() at all
-- and are deliberately unaffected: money already captured by a gateway must
-- still land, or the customer is charged with nothing to show for it.
create or replace function public.assert_actor_not_suspended()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and exists (select 1 from public.profiles where id = auth.uid() and is_suspended) then
    raise exception 'account_suspended';
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_block_suspended on public.transactions;
create trigger transactions_block_suspended
  before insert on public.transactions
  for each row execute function public.assert_actor_not_suspended();

drop trigger if exists wallet_ledger_block_suspended on public.wallet_ledger;
create trigger wallet_ledger_block_suspended
  before insert on public.wallet_ledger
  for each row execute function public.assert_actor_not_suspended();

revoke all on function public.assert_actor_not_suspended() from anon, authenticated;
