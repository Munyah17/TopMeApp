import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "./client";
import { adminTopupAlert } from "./admin-notify";
import { topupConfirmationEmail, topupFailedEmail } from "./templates";

const PROVIDER_LABEL: Record<string, string> = { paynow: "Paynow", stripe: "Card (Stripe)", ecocash: "EcoCash" };

/** Used from gateway callbacks/webhooks, which only have a user id (no session) to work from. */
export async function notifyTopupResult(
  admin: SupabaseClient,
  opts: { userId: string; amount: number; provider: string; reference: string; success: boolean }
) {
  const { data: profile } = await admin.from("profiles").select("email").eq("id", opts.userId).single();
  const email = profile?.email as string | undefined;

  // Owner alert goes out for every top-up outcome, even when the customer
  // has no profile email — the alert carries the user id in that case.
  void adminTopupAlert({
    amount: opts.amount,
    provider: opts.provider,
    reference: opts.reference,
    success: opts.success,
    customer: email ?? opts.userId,
  });

  if (!email) return;

  const providerLabel = PROVIDER_LABEL[opts.provider] ?? opts.provider;

  if (opts.success) {
    const { data: wallet } = await admin.from("wallets").select("balance").eq("user_id", opts.userId).single();
    const { subject, html } = topupConfirmationEmail({
      amount: opts.amount,
      provider: providerLabel,
      reference: opts.reference,
      balance: (wallet?.balance as number) ?? 0,
    });
    await sendEmail({ sender: "noreply", to: email, subject, html, replyTo: "info@topme.co.zw" });
  } else {
    const { subject, html } = topupFailedEmail({ amount: opts.amount, provider: providerLabel });
    await sendEmail({ sender: "noreply", to: email, subject, html, replyTo: "info@topme.co.zw" });
  }
}
