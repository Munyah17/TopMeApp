import { NextResponse, type NextRequest } from "next/server";
import { getStripe } from "@/lib/payments/stripe";
import { createAdminClient } from "@/lib/supabase/server";
import { notifyTopupResult } from "@/lib/email/notify";
import { finalizeGuestCheckout } from "@/lib/payments/guest-checkout";
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
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const reference = session.metadata?.reference;
    const purpose = session.metadata?.purpose;

    if (reference && purpose === "guest_service_payment") {
      try {
        await finalizeGuestCheckout(reference);
      } catch {
        // Already finalized by another webhook delivery, or intent not
        // found/pending — safe to ignore, Stripe will not retry on 200.
      }
      return NextResponse.json({ received: true });
    }

    const userId = session.metadata?.userId;
    if (reference && userId) {
      const admin = createAdminClient();
      const { data: intent } = await admin
        .from("topup_intents")
        .select("*")
        .eq("reference", reference)
        .eq("status", "pending")
        .single();
      if (intent) {
        await admin.rpc("wallet_topup", {
          p_user_id: userId,
          p_amount: intent.amount,
          p_provider: "stripe",
          p_reference: reference,
          p_meta: { sessionId: session.id },
        });
        await admin.from("topup_intents").update({ status: "completed" }).eq("reference", reference);
        await notifyTopupResult(admin, { userId, amount: intent.amount, provider: "stripe", reference, success: true });
      }
    }
  }

  return NextResponse.json({ received: true });
}
