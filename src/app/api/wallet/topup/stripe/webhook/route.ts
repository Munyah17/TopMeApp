import { NextResponse, type NextRequest } from "next/server";
import { getStripe } from "@/lib/payments/stripe";
import { createAdminClient } from "@/lib/supabase/server";
import { notifyTopupResult } from "@/lib/email/notify";
import { finalizeGuestCheckout } from "@/lib/payments/guest-checkout";
import { finalizeInsuranceCheckout } from "@/lib/actions/insurance";
import { recordIntegrationHealth } from "@/lib/integrations/health";
import { logTransactionEvent } from "@/lib/transaction-events";
import type Stripe from "stripe";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "not_configured" }, { status: 400 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (e) {
    // Rejected auth isn't an integration-health signal — any internet probe
    // of this public URL produces an invalid signature, which isn't evidence
    // that Stripe is down. Still logged for forensics.
    console.error(`[stripe webhook] invalid signature: ${e instanceof Error ? e.message : "unknown"}`);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }
  void recordIntegrationHealth(createAdminClient(), "stripe", { success: true });

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const reference = session.metadata?.reference;
    const purpose = session.metadata?.purpose;

    if (reference && purpose === "guest_service_payment") {
      try {
        await finalizeGuestCheckout(reference);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes("not_found_or_processed")) {
          // Expected/benign: already finalized by another webhook delivery
          // (Stripe retries deliveries) — genuinely safe to ignore.
          return NextResponse.json({ received: true });
        }
        // A real failure — Stripe already captured the customer's card
        // payment, and swallowing this here would mean it's lost with no
        // trace anywhere. Log it for real and return a non-200 so Stripe
        // retries the delivery instead of considering it handled.
        console.error(`[stripe webhook] finalizeGuestCheckout failed for ${reference}:`, message);
        void logTransactionEvent(createAdminClient(), { reference, eventType: "fulfillment_failed", message: `Stripe webhook: finalizeGuestCheckout threw — ${message}` });
        return NextResponse.json({ error: "finalize_failed" }, { status: 500 });
      }
      return NextResponse.json({ received: true });
    }

    if (reference && purpose === "insurance_payment") {
      const result = await finalizeInsuranceCheckout(reference);
      if (result.error) {
        console.error(`[stripe webhook] finalizeInsuranceCheckout failed for ${reference}:`, result.error);
        void logTransactionEvent(createAdminClient(), { reference, eventType: "fulfillment_failed", message: `Stripe webhook: finalizeInsuranceCheckout failed — ${result.error}` });
        return NextResponse.json({ error: "finalize_failed" }, { status: 500 });
      }
      return NextResponse.json({ received: true });
    }

    const userId = session.metadata?.userId;
    if (reference && userId) {
      const admin = createAdminClient();
      const { data: ledgerRow, error } = await admin.rpc("wallet_topup_from_intent", { p_reference: reference, p_extra_meta: { sessionId: session.id } });
      if (error) {
        if (!error.message.includes("not_found_or_processed")) {
          console.error(`[stripe webhook] wallet_topup_from_intent failed for ${reference}:`, error.message);
          void logTransactionEvent(admin, { reference, eventType: "payment_failed", message: `Stripe webhook: wallet_topup_from_intent failed — ${error.message}` });
          return NextResponse.json({ error: "topup_failed" }, { status: 500 });
        }
        // not_found_or_processed — already credited by a concurrent delivery.
      } else {
        await notifyTopupResult(admin, { userId, amount: (ledgerRow as { amount: number }).amount, provider: "stripe", reference, success: true });
      }
    }
  }

  return NextResponse.json({ received: true });
}
