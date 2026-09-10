-- Admins/superadmins could not read another customer's wallet balance or
-- wallet ledger: `wallets` and `wallet_ledger` only ever had a *_select_own
-- policy (auth.uid() = user_id), unlike `transactions` and `profiles` which
-- also carry a *_select_admin policy. So the admin user-detail page showed
-- $0 / an empty ledger for every customer, and the reports that total
-- refunds and adjustments came back blank — even though the money was in
-- the database. (Writes are unaffected: every wallet write already goes
-- through a SECURITY DEFINER function.)
drop policy if exists wallets_select_admin on public.wallets;
create policy wallets_select_admin on public.wallets
  for select using (public.is_admin(auth.uid()));

drop policy if exists wallet_ledger_select_admin on public.wallet_ledger;
create policy wallet_ledger_select_admin on public.wallet_ledger
  for select using (public.is_admin(auth.uid()));
