import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkPaynowStatus } from "@/lib/payments/paynow";
import { applyPaynowResult } from "@/lib/payments/paynow-result";
import { reconcileFulfilments } from "@/lib/payments/reconcile-fulfilment";
import { logTransactionEvent } from "@/lib/transaction-events";

// Background reconciliation for Paynow — the safety net under an unreliable
// webhook.
//
// Paynow gives us two ways to learn a payment succeeded, and both depend on
// something outside our control:
//   1. the result_url callback, which their own behaviour makes optional —
//      it can arrive late or (confirmed on a real transaction) never; and
//   2. someone being on the wallet/confirm screen to poll, which stops the
//      instant the customer closes the tab, loses signal, or their battery
//      dies on the Paynow hosted page.
//
// When both miss, Paynow has taken the customer's money and the intent sits
// `pending` forever with nothing to credit it — the failure mode is silent,
// permanent, and always in the customer's disfavour. So the poll URL that
// initiatetransaction handed us is treated as the authoritative channel, and
// this sweep asks Paynow directly for every pending intent regardless of who
// is or isn't watching. The callback and the in-page polling become
// optimisations for latency; correctness no longer rests on either.
//
// Everything downstream is already idempotent: applyPaynowResult settles
// through wallet_topup_from_intent's `for update` (top-ups) and
// finalize_guest_payment's (guest checkouts), so a sweep racing a callback
// or a customer's own tap resolves to exactly one credit.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Give the normal paths a moment before stepping in — an intent seconds old
// is very likely mid-flight on someone's screen right now.
const MIN_AGE_MS = 90_000;
// Paynow checkout sessions don't live for days; past this an intent that has
// never reached a paid state never will.
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
// Bounded so one sweep can't outrun maxDuration and die halfway.
const BATCH = 40;

type Intent = { reference: string; created_at: string; meta: { pollUrl?: string } | null };

export async function POST(request: NextRequest) {
  // Vercel Cron sends this header; a manual/ops call can present the secret
  // as a bearer token instead. Without CRON_SECRET set the route refuses to
  // run at all rather than defaulting open — it can settle real money.
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  const isVercelCron = request.headers.get("x-vercel-cron") === "1";
  if (!secret) return NextResponse.json({ error: "cron_not_configured" }, { status: 503 });
  if (!isVercelCron && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = Date.now();
  const notBefore = new Date(now - STALE_AFTER_MS).toISOString();
  const notAfter = new Date(now - MIN_AGE_MS).toISOString();

  const [topups, guests] = await Promise.all([
    admin
      .from("topup_intents")
      .select("reference, created_at, meta")
      .eq("status", "pending")
      .eq("provider", "paynow")
      .gte("created_at", notBefore)
      .lte("created_at", notAfter)
      .order("created_at", { ascending: true })
      .limit(BATCH),
    admin
      .from("guest_checkout_intents")
      .select("reference, created_at, meta")
      .eq("status", "pending")
      .eq("provider", "paynow")
      .gte("created_at", notBefore)
      .lte("created_at", notAfter)
      .order("created_at", { ascending: true })
      .limit(BATCH),
  ]);

  const queue: Array<{ kind: "topup" | "guest"; intent: Intent }> = [
    ...(((topups.data as Intent[] | null) ?? []).map((intent) => ({ kind: "topup" as const, intent }))),
    ...(((guests.data as Intent[] | null) ?? []).map((intent) => ({ kind: "guest" as const, intent }))),
  ];

  const summary = { checked: 0, settled: 0, failed: 0, stillPending: 0, unreachable: 0, noPollUrl: 0 };

  for (const { kind, intent } of queue) {
    const pollUrl = intent.meta?.pollUrl;
    if (!pollUrl) {
      // Initiate succeeded but the follow-up write that stores pollUrl
      // didn't land. Nothing to poll, and no way to recover it from here —
      // record it so it's visible rather than silently skipped forever.
      summary.noPollUrl++;
      void logTransactionEvent(admin, {
        reference: intent.reference,
        eventType: "payment_failed",
        message: `Reconciler: ${kind} intent is pending with no pollUrl — cannot verify with Paynow, needs manual review.`,
      });
      continue;
    }

    summary.checked++;
    const result = await checkPaynowStatus(pollUrl);
    if (!result.ok || !result.status) {
      // Paynow unreachable this round. Leave it pending — the next sweep
      // retries, which is exactly why this runs on a schedule.
      summary.unreachable++;
      continue;
    }

    const before = result.status;
    await applyPaynowResult(intent.reference, before, result.fields);

    // applyPaynowResult acts only on terminal statuses; "created"/"sent"
    // mean the customer never finished on Paynow's page.
    const settled = ["paid", "awaiting delivery", "delivered"].includes(before);
    const declined = ["cancelled", "disputed"].includes(before);
    if (settled) summary.settled++;
    else if (declined) summary.failed++;
    else {
      summary.stillPending++;
      // Only ever expire something Paynow itself reports as never-paid, and
      // only once it's far past any plausible checkout. A paid intent is
      // settled by the branch above long before it can reach this.
      if (now - new Date(intent.created_at).getTime() > STALE_AFTER_MS - 60_000) {
        const table = kind === "topup" ? "topup_intents" : "guest_checkout_intents";
        await admin.from(table).update({ status: "failed" }).eq("reference", intent.reference).eq("status", "pending");
        void logTransactionEvent(admin, {
          reference: intent.reference,
          eventType: "payment_failed",
          message: `Reconciler: expired after 7 days — Paynow still reported "${before}", so it was never paid.`,
        });
      }
    }
  }

  // Backstop: refund any fulfilment that failed (or has been stuck pending
  // for over a day) and doesn't already have a refund_request.
  let fulfilment;
  try {
    fulfilment = await reconcileFulfilments();
  } catch (e) {
    console.error("[reconcile-payments] fulfilment sweep threw:", e);
    fulfilment = { error: e instanceof Error ? e.message : "sweep failed" };
  }

  if (summary.settled || summary.noPollUrl || (fulfilment && "failedSwept" in fulfilment && (fulfilment.failedSwept || fulfilment.stalePendingSwept))) {
    console.log(`[reconcile-payments] ${JSON.stringify({ ...summary, fulfilment })}`);
  }
  return NextResponse.json({ ok: true, ...summary, fulfilment });
}

// Same work, so a browser/curl check or an external scheduler that only does
// GET can drive it too.
export async function GET(request: NextRequest) {
  return POST(request);
}
