"use server";

import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { initiatePaynowPayment } from "@/lib/payments/paynow";
import { createTopupCheckoutSession } from "@/lib/payments/stripe";
import { initiateEcocashPush } from "@/lib/payments/ecocash";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Please log in again to continue.");
  return { supabase, user };
}

function newReference(prefix: string) {
  return `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function startPaynowTopup(amount: number) {
  const { supabase, user } = await requireUser();
  const reference = newReference("PNW");

  await supabase.from("topup_intents").insert({ user_id: user.id, amount, provider: "paynow", reference });

  const result = await initiatePaynowPayment({ reference, amount, authEmail: user.email || "" });
  if (!result.ok || !result.browserUrl) {
    await supabase.from("topup_intents").update({ status: "failed" }).eq("reference", reference);
    throw new Error(result.error || "Could not start Paynow payment.");
  }
  return { redirectUrl: result.browserUrl };
}

export async function startStripeTopup(amount: number) {
  const { supabase, user } = await requireUser();
  const reference = newReference("STR");

  await supabase.from("topup_intents").insert({ user_id: user.id, amount, provider: "stripe", reference });

  const session = await createTopupCheckoutSession({ amount, reference, userId: user.id, customerEmail: user.email });
  if (!session.url) throw new Error("Could not start Stripe checkout.");
  await supabase.from("topup_intents").update({ meta: { sessionId: session.id } }).eq("reference", reference);
  return { redirectUrl: session.url };
}

export async function startEcocashTopup(amount: number, phone: string) {
  const { supabase, user } = await requireUser();
  const reference = newReference("ECO");

  await supabase.from("topup_intents").insert({ user_id: user.id, amount, provider: "ecocash", reference, meta: { phone } });

  const result = await initiateEcocashPush({ phone, amount, reference });
  if (!result.ok) {
    await supabase.from("topup_intents").update({ status: "failed" }).eq("reference", reference);
    throw new Error(result.error || "Could not start EcoCash payment.");
  }
  await supabase
    .from("topup_intents")
    .update({ meta: { phone, endUserId: result.endUserId } })
    .eq("reference", reference);
  return { reference };
}

export async function checkTopupStatus(reference: string) {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("topup_intents").select("status").eq("reference", reference).single();
  return data?.status ?? "pending";
}
