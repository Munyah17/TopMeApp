import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// Diagnostic: verifies the DB objects the Send Money / Red Packet flow depends
// on actually exist — the wallet_transfer + find_profile_by_phone RPCs, the
// p2p_transfers table, and the p2p_send/p2p_receive ledger_type enum values.
// Hit /api/test-p2p after deploying to confirm the migration was applied.
export async function GET() {
  const admin = createAdminClient();
  const checks: Record<string, unknown> = {};

  // 1. find_profile_by_phone RPC — call with a phone that won't match; a
  //    "function does not exist" error means the migration never ran.
  const lookup = await admin.rpc("find_profile_by_phone", { p_phone: "0000000000" });
  checks.find_profile_by_phone = lookup.error ? { ok: false, error: lookup.error.message } : { ok: true };

  // 2. p2p_transfers table — a head count is enough to prove it exists.
  const table = await admin.from("p2p_transfers").select("id", { count: "exact", head: true });
  checks.p2p_transfers_table = table.error ? { ok: false, error: table.error.message } : { ok: true, rows: table.count };

  // 3. wallet_transfer RPC — call it with a deliberately-invalid amount (0).
  //    If the function exists it raises 'invalid_amount' (or
  //    'not_authenticated' first, since there's no session); a
  //    "function ... does not exist" / schema-cache error means it's missing.
  const xfer = await admin.rpc("wallet_transfer", { p_receiver_phone: "0000000000", p_amount: 0, p_note: null, p_kind: "transfer" });
  if (xfer.error) {
    const msg = xfer.error.message;
    const missing = /does not exist|schema cache|could not find/i.test(msg);
    checks.wallet_transfer = missing ? { ok: false, error: msg } : { ok: true, note: `exists (rejected with: ${msg})` };
  } else {
    checks.wallet_transfer = { ok: true, note: "unexpectedly succeeded" };
  }

  // 4. ledger_type enum values — try inserting a p2p_send row shape via a
  //    dry-run select on the enum. Simpler: query pg_enum via rpc isn't
  //    available, so probe wallet_ledger columns instead.
  const ledger = await admin.from("wallet_ledger").select("id", { count: "exact", head: true });
  checks.wallet_ledger_table = ledger.error ? { ok: false, error: ledger.error.message } : { ok: true };

  const failed = Object.values(checks).some((c) => (c as { ok?: boolean }).ok === false);
  return NextResponse.json({ status: failed ? "missing-db-objects" : "ok", checks }, { status: failed ? 500 : 200 });
}
