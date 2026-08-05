import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { GuestCheckoutIntent, Transaction, TopupIntent, WalletLedgerRow } from "@/types/database";

export interface TransactionFilters {
  q?: string;
  status?: string;
  fulfillmentStatus?: string;
  from?: string;
  to?: string;
}

export async function getTransactionsForAdmin(filters: TransactionFilters = {}, limit = 100): Promise<Transaction[]> {
  const supabase = await createClient();
  let query = supabase.from("transactions").select("*").order("created_at", { ascending: false }).limit(limit);

  if (filters.q) {
    const term = filters.q.trim().replace(/[%,]/g, "");
    query = query.or(`reference.ilike.%${term}%,recipient_identifier.ilike.%${term}%,guest_email.ilike.%${term}%`);
  }
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.fulfillmentStatus) query = query.eq("fulfillment_status", filters.fulfillmentStatus);
  if (filters.from) query = query.gte("created_at", filters.from);
  if (filters.to) query = query.lte("created_at", filters.to);

  const { data } = await query;
  return (data as Transaction[]) ?? [];
}

export async function getTransactionDetail(id: string): Promise<{ transaction: Transaction | null; ledgerRows: WalletLedgerRow[] }> {
  const supabase = await createClient();
  const { data: tx } = await supabase.from("transactions").select("*").eq("id", id).single();
  if (!tx) return { transaction: null, ledgerRows: [] };

  const transaction = tx as Transaction;
  // Two separate lookups merged in JS rather than one combined filter: the
  // original debit is keyed by the transaction's own reference, but a later
  // refund/adjustment ledger row references it via meta.transaction_id
  // instead — PostgREST's jsonb operators don't combine cleanly with .or().
  const [{ data: byReference }, { data: byMeta }] = await Promise.all([
    supabase.from("wallet_ledger").select("*").eq("reference", transaction.reference),
    transaction.user_id
      ? supabase.from("wallet_ledger").select("*").eq("user_id", transaction.user_id).eq("type", "refund")
      : Promise.resolve({ data: [] as WalletLedgerRow[] }),
  ]);
  const metaMatches = ((byMeta as WalletLedgerRow[]) ?? []).filter((r) => r.meta?.transaction_id === id);
  const seen = new Set<string>();
  const ledgerRows = [...((byReference as WalletLedgerRow[]) ?? []), ...metaMatches]
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return { transaction, ledgerRows };
}

// Triage queue for /admin/operations: anything that took a customer's money
// (or reserved a gateway charge) but hasn't cleanly settled, past a grace
// window so freshly-initiated payments in flight aren't flagged as stuck.
export async function getAttentionQueue() {
  const supabase = await createClient();
  const graceWindow = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const [{ data: stuckTx }, { data: stuckTopups }, { data: stuckGuest }] = await Promise.all([
    supabase
      .from("transactions")
      .select("*")
      .in("fulfillment_status", ["pending", "failed"])
      .lte("created_at", graceWindow)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("topup_intents")
      .select("*")
      .eq("status", "pending")
      .lte("created_at", graceWindow)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("guest_checkout_intents")
      .select("*")
      .eq("status", "pending")
      .lte("created_at", graceWindow)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return {
    stuckTransactions: (stuckTx as Transaction[]) ?? [],
    stuckTopups: (stuckTopups as TopupIntent[]) ?? [],
    stuckGuestCheckouts: (stuckGuest as GuestCheckoutIntent[]) ?? [],
  };
}

export async function getAttentionCount(): Promise<number> {
  const { stuckTransactions, stuckTopups, stuckGuestCheckouts } = await getAttentionQueue();
  return stuckTransactions.length + stuckTopups.length + stuckGuestCheckouts.length;
}
