import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AdminAuditLogRow, GuestCheckoutIntent, Profile, Transaction, TransactionEventRow, TopupIntent, WalletLedgerRow } from "@/types/database";

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

export interface TransactionTimelineEntry {
  id: string;
  eventType: string;
  message: string;
  meta: Record<string, unknown>;
  createdAt: string;
  source: "system" | "admin";
  actorName?: string;
}

// Merges the real payment/fulfillment event log (transaction_events — see
// src/lib/transaction-events.ts) with any staff actions on this same
// transaction (admin_audit_log) into one chronological "what actually
// happened" timeline for the transaction detail page.
export async function getTransactionTimeline(transactionId: string, reference: string): Promise<TransactionTimelineEntry[]> {
  const supabase = await createClient();
  const [{ data: events }, { data: auditRows }] = await Promise.all([
    supabase
      .from("transaction_events")
      .select("*")
      .or(`transaction_id.eq.${transactionId},reference.eq.${reference}`)
      .order("created_at", { ascending: true }),
    supabase.from("admin_audit_log").select("*").eq("target_table", "transactions").eq("target_id", transactionId).order("created_at", { ascending: true }),
  ]);

  const auditList = (auditRows as AdminAuditLogRow[]) ?? [];
  const actorIds = Array.from(new Set(auditList.map((r) => r.actor_id).filter((id): id is string => !!id)));
  const { data: profiles } = actorIds.length ? await supabase.from("profiles").select("id, full_name").in("id", actorIds) : { data: [] };
  const actorName = new Map(((profiles as Pick<Profile, "id" | "full_name">[]) ?? []).map((p) => [p.id, p.full_name]));

  const systemEntries: TransactionTimelineEntry[] = ((events as TransactionEventRow[]) ?? []).map((e) => ({
    id: e.id,
    eventType: e.event_type,
    message: e.message,
    meta: e.meta,
    createdAt: e.created_at,
    source: "system",
  }));
  const adminEntries: TransactionTimelineEntry[] = auditList.map((r) => ({
    id: r.id,
    eventType: r.action,
    message: r.action.replace(/[._]/g, " "),
    meta: r.meta,
    createdAt: r.created_at,
    source: "admin",
    actorName: (r.actor_id && actorName.get(r.actor_id)) || "Staff",
  }));

  return [...systemEntries, ...adminEntries].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export interface RecentFailure {
  id: string;
  reference: string | null;
  eventType: string;
  message: string;
  createdAt: string;
  transactionId: string | null;
  serviceId?: string;
}

// Powers the dashboard's "Recent failures" panel — real events, not a
// synthetic health summary, so a stuck/failed purchase surfaces proactively
// instead of only being discoverable by already knowing to look.
export async function getRecentFailures(limit = 8): Promise<RecentFailure[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("transaction_events")
    .select("*")
    .in("event_type", ["fulfillment_failed", "payment_failed"])
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = (data as TransactionEventRow[]) ?? [];
  if (rows.length === 0) return [];

  const txIds = Array.from(new Set(rows.map((r) => r.transaction_id).filter((id): id is string => !!id)));
  const { data: txRows } = txIds.length ? await supabase.from("transactions").select("id, service_id").in("id", txIds) : { data: [] };
  const serviceById = new Map(((txRows as { id: string; service_id: string }[]) ?? []).map((t) => [t.id, t.service_id]));

  return rows.map((r) => ({
    id: r.id,
    reference: r.reference,
    eventType: r.event_type,
    message: r.message,
    createdAt: r.created_at,
    transactionId: r.transaction_id,
    serviceId: r.transaction_id ? serviceById.get(r.transaction_id) : undefined,
  }));
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
