"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getFulfillmentProvider, hasRealCoverage } from "@/lib/fulfillment";
import { validateBillAccount as vitalpayValidateBillAccount, validateElectricityMeter } from "@/lib/fulfillment/vitalpay";
import { isFeatureEnabled } from "@/lib/data/flags";
import { findProfileByPhone } from "@/lib/data/queries";
import { sendEmail } from "@/lib/email/client";
import { giftRedeemedEmail, giftSentEmail, moneyReceivedEmail, moneySentEmail, paymentReceiptEmail } from "@/lib/email/templates";
import { logTransactionEvent } from "@/lib/transaction-events";
import { resolveVerifiedAmount } from "@/lib/pricing";
import { sendPushToUser } from "@/lib/push/send";
import type { ApiModuleSafe, P2pTransfer, Transaction } from "@/types/database";

const FRIENDLY_ERRORS: Record<string, string> = {
  insufficient_funds: "Your wallet balance is too low for this payment. Top up and try again.",
  not_authenticated: "Please log in again to continue.",
  wallet_not_found: "We couldn't find your wallet. Please contact support.",
  invalid_amount: "Enter a valid amount.",
  recipient_not_found: "No TopMe account found with that phone number.",
  cannot_pay_self: "You can't send money to your own number.",
  service_unavailable: "This service isn't available right now. Please check back soon.",
  feature_disabled: "This feature is temporarily turned off. Please check back soon.",
};

function friendlyError(message: string) {
  const key = Object.keys(FRIENDLY_ERRORS).find((k) => message.includes(k));
  return key ? FRIENDLY_ERRORS[key] : "Something went wrong processing that payment. Please try again.";
}

export interface PayServiceInput {
  serviceId: string;
  serviceName: string;
  amount: number;
  recipient: string;
  networkId?: string | null;
  extraValue?: string | null;
  bundleId?: string | null;
  pkgId?: string | null;
  packageIndex?: number | null;
  payFullBalance?: boolean;
  saveBeneficiary?: boolean;
  beneficiaryLabel?: string;
}

export async function payService(input: PayServiceInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error(FRIENDLY_ERRORS.not_authenticated);

  // Never debit a wallet for a service with no real provider behind it —
  // this must run before wallet_pay, not after (see /pay/[serviceId]/page.tsx
  // for the same check gating the checkout UI itself).
  const admin = createAdminClient();
  const [{ data: activeModules }, { data: service }] = await Promise.all([
    admin.from("api_modules_safe").select("*").eq("status", "active"),
    admin.from("services").select("id, amount_mode, outstanding").eq("id", input.serviceId).single(),
  ]);
  if (!service) throw new Error(FRIENDLY_ERRORS.service_unavailable);
  if (!hasRealCoverage(input.serviceId, (activeModules as ApiModuleSafe[]) ?? [])) {
    throw new Error(FRIENDLY_ERRORS.service_unavailable);
  }

  // Never trust a client-supplied amount for a fixed-price catalog item
  // (data bundle, TV package, outstanding bill) — recompute it from the
  // real catalog row. Only "chips" mode (airtime, ZESA, bills the customer
  // enters an amount for) legitimately takes the caller's own amount.
  const verifiedAmount = await resolveVerifiedAmount(service, {
    bundleId: input.bundleId,
    pkgId: input.pkgId,
    packageIndex: input.packageIndex,
    payFullBalance: input.payFullBalance,
    clientAmount: input.amount,
  });

  // Airtime: honour the network operator's own amount rules (NetOne only
  // sells fixed denominations, Econet has a min/max) BEFORE the wallet is
  // touched — an unsupported amount used to be charged and then bounced by
  // VitalPay with a 422.
  if (input.serviceId === "airtime" && input.networkId) {
    const { getAirtimeOperatorRules } = await import("@/lib/data/queries");
    const { checkAirtimeAmount } = await import("@/lib/fulfillment/vitalpay");
    const rules = await getAirtimeOperatorRules();
    const check = checkAirtimeAmount(rules[input.networkId], verifiedAmount);
    if (!check.ok) throw new Error(check.message);
  }

  // Resolve fulfillment up front: the first active aggregator that covers
  // this service (already confirmed to exist by the coverage check above).
  // The transaction record must carry the real provider name — hardcoding
  // "simulated" made live VitalPay attempts indistinguishable from demo runs.
  const provider = getFulfillmentProvider(input.serviceId, (activeModules as ApiModuleSafe[]) ?? []);

  const { data: txData, error } = await supabase.rpc("wallet_pay", {
    p_service_id: input.serviceId,
    p_amount: verifiedAmount,
    p_recipient: input.recipient,
    p_network_id: input.networkId ?? null,
    p_extra_value: input.extraValue ?? null,
    p_fulfillment_provider: provider.name,
  });

  if (error) {
    throw new Error(friendlyError(error.message));
  }

  const tx = txData as Transaction;
  void logTransactionEvent(admin, {
    transactionId: tx.id,
    reference: tx.reference,
    eventType: "payment_confirmed",
    message: `Paid from wallet balance — $${verifiedAmount.toFixed(2)}.`,
  });

  const fulfillmentInput = {
    transactionId: tx.id,
    serviceId: input.serviceId,
    recipient: input.recipient,
    extraValue: input.extraValue,
    networkId: input.networkId,
    amount: verifiedAmount,
  };
  void logTransactionEvent(admin, {
    transactionId: tx.id,
    reference: tx.reference,
    eventType: "fulfillment_started",
    message: `Calling ${provider.name} to fulfil this order.`,
  });
  let fulfillmentResult;
  try {
    fulfillmentResult = await provider.fulfil(fulfillmentInput);
  } catch (e) {
    // Wallet is already debited at this point — the honest thing to do is
    // record a real failure so it's visible for a manual refund/retry, not
    // fake a "simulated" success that hides that nothing was delivered.
    fulfillmentResult = {
      status: "failed" as const,
      message: e instanceof Error ? `${provider.name} error: ${e.message}` : `${provider.name} failed to fulfil this order.`,
    };
  }
  void logTransactionEvent(admin, {
    transactionId: tx.id,
    reference: tx.reference,
    eventType: fulfillmentResult.status === "fulfilled" ? "fulfillment_success" : fulfillmentResult.status === "failed" ? "fulfillment_failed" : "fulfillment_started",
    message: fulfillmentResult.message || `${provider.name} returned status: ${fulfillmentResult.status}.`,
    meta: { provider: provider.name, providerRef: fulfillmentResult.providerRef ?? null },
  });

  const { data: updatedTx } = await admin.rpc("set_fulfillment_result", {
    p_transaction_id: tx.id,
    p_status: fulfillmentResult.status,
    p_receipt: {
      provider: provider.name,
      providerRef: fulfillmentResult.providerRef ?? null,
      message: fulfillmentResult.message ?? null,
      ...(fulfillmentResult.extra ?? {}),
    },
  });

  // The wallet is already debited. If fulfilment failed outright, put the
  // money back now — automatically for a small wallet failure, or into the
  // staff approval queue otherwise (see 2026-09-10-fulfilment-auto-refund).
  if (fulfillmentResult.status === "failed") {
    const { recordFailedFulfilmentRefund } = await import("@/lib/payments/refunds");
    const refund = await recordFailedFulfilmentRefund(admin, {
      transactionId: tx.id,
      reference: tx.reference,
      serviceName: input.serviceName,
      reason: fulfillmentResult.message || `${provider.name} could not fulfil this order.`,
    });
    revalidatePath("/home");
    revalidatePath("/history");
    revalidatePath("/wallet");
    // The debit was already reversed (or queued for staff) — surface the real
    // outcome. Returning the tx here let every flow render "successful" for a
    // payment that had just failed and refunded (the 2026-09-17 airtime bug).
    throw new Error(
      refund?.status === "paid"
        ? `${input.serviceName} delivery failed — $${refund.amount.toFixed(2)} has been refunded to your wallet.`
        : `${input.serviceName} delivery failed — your refund is being processed.`
    );
  }

  if (input.saveBeneficiary) {
    await supabase.from("beneficiaries").insert({
      user_id: user.id,
      label: input.beneficiaryLabel || input.recipient,
      service_id: input.serviceId,
      identifier: input.recipient,
    });
  }

  revalidatePath("/home");
  revalidatePath("/history");
  revalidatePath("/wallet");

  const finalTx = (updatedTx as Transaction) ?? tx;

  if (user.email) {
    const { subject, html } = paymentReceiptEmail({
      serviceName: input.serviceName,
      amount: verifiedAmount,
      reference: finalTx.reference,
      recipient: input.recipient,
      date: new Date(finalTx.created_at).toLocaleString("en-GB"),
    });
    // Fire-and-forget — sendEmail never throws, so this can't fail the payment.
    void sendEmail({ sender: "noreply", to: user.email, subject, html, replyTo: "accounts@topme.co.zw" });
  }

  return finalTx;
}

export async function sendGiftVoucher(receiverPhone: string, amount: number, senderPhone?: string) {
  if (!(await isFeatureEnabled("gift_vouchers_enabled"))) throw new Error(FRIENDLY_ERRORS.feature_disabled);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase.rpc("wallet_gift_send", {
    p_receiver_phone: receiverPhone,
    p_amount: amount,
    p_sender_phone: senderPhone ?? null,
  });
  if (error) throw new Error(friendlyError(error.message));

  revalidatePath("/wallet");
  revalidatePath("/home");

  if (user?.email) {
    const { subject, html } = giftSentEmail({ amount, receiverPhone, code: data.code });
    void sendEmail({ sender: "noreply", to: user.email, subject, html });
  }

  return data;
}

// Redeem a gift-card code into the caller's own wallet. The credited amount
// is ring-fenced from cash-out (wallets.gift_locked) — gift balance spends
// on TopMe services but can't be withdrawn.
export async function redeemGiftVoucher(rawCode: string) {
  const code = rawCode.trim().toUpperCase();
  if (!/^GFT-?\d{6}$/.test(code)) throw new Error("That doesn't look like a gift code. It's in the form GFT-123456.");
  const normalised = code.startsWith("GFT-") ? code : `GFT-${code.slice(3)}`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error(FRIENDLY_ERRORS.not_authenticated);

  const { data, error } = await supabase.rpc("wallet_gift_redeem", { p_code: normalised });
  if (error) {
    const msg = error.message.includes("voucher_not_found")
      ? "No gift card found with that code."
      : error.message.includes("voucher_already_redeemed")
        ? "This gift card has already been redeemed."
        : friendlyError(error.message);
    throw new Error(msg);
  }

  const voucher = data as { amount: number; code: string };
  revalidatePath("/wallet");
  revalidatePath("/home");

  if (user.email) {
    const admin = createAdminClient();
    const { data: wallet } = await admin.from("wallets").select("balance").eq("user_id", user.id).single();
    const { subject, html } = giftRedeemedEmail({
      amount: voucher.amount,
      code: voucher.code,
      balance: (wallet?.balance as number) ?? 0,
    });
    void sendEmail({ sender: "noreply", to: user.email, subject, html, replyTo: "accounts@topme.co.zw" });
  }

  return voucher;
}

// Looks up who a phone number belongs to before money moves, so the sender
// can confirm "Sending to <name>" rather than typing blind.
export async function lookupRecipient(phone: string) {
  return findProfileByPhone(phone.trim());
}

export type MeterCheckResult =
  | { state: "ok"; customerName: string | null; address: string | null; meterNumber: string }
  | { state: "invalid"; message: string }
  // Validation service is down, not configured, or ZESA is on the simulated
  // provider — the UI treats this as "couldn't check" and lets checkout
  // proceed rather than hard-blocking on our side.
  | { state: "skipped" };

// Confirms a prepaid ZESA meter number against ZETDC (via VitalPay) and
// returns the registered account holder, so the buyer can eyeball
// "topping up <name>'s meter" before paying. Only runs when ZESA is
// actually wired to a live VitalPay module.
export async function validateMeter(meterNumber: string): Promise<MeterCheckResult> {
  const meter = meterNumber.trim();
  if (meter.length < 4) return { state: "invalid", message: "Enter your full ZESA meter number." };

  const admin = createAdminClient();
  const { data: modules } = await admin.from("api_modules_safe").select("*").eq("status", "active");
  const provider = getFulfillmentProvider("zesa", (modules ?? []) as ApiModuleSafe[]);
  if (provider.name !== "vitalpay") return { state: "skipped" };

  try {
    const check = await validateElectricityMeter(meter);
    if (check.valid) {
      return { state: "ok", customerName: check.customerName, address: check.address, meterNumber: check.meterNumber };
    }
    if (check.reason === "invalid_meter") return { state: "invalid", message: check.message };
    return { state: "skipped" };
  } catch {
    return { state: "skipped" };
  }
}

export type BillAccountCheckResult =
  | { state: "ok"; customerName: string | null; accountNumber: string }
  | { state: "invalid"; message: string }
  // Validation service is down, not configured, or this biller isn't wired
  // to a live provider — the UI treats this as "couldn't check" and lets
  // checkout proceed rather than hard-blocking on our side.
  | { state: "skipped" };

// Confirms a biller account number (ZOL, DStv, TelOne, Bulawayo City
// Council) against the biller's own records via VitalPay and returns the
// registered account holder, so the buyer can eyeball "paying <name>'s
// account" before money moves. Only runs when the service is actually wired
// to a live VitalPay module — anything else reports "skipped".
export async function validateBillAccount(serviceId: string, accountNumber: string): Promise<BillAccountCheckResult> {
  const account = accountNumber.trim();
  if (account.length < 3) return { state: "invalid", message: "Enter your full account number." };

  const admin = createAdminClient();
  const { data: modules } = await admin.from("api_modules_safe").select("*").eq("status", "active");
  const provider = getFulfillmentProvider(serviceId, (modules ?? []) as ApiModuleSafe[]);
  if (provider.name !== "vitalpay") return { state: "skipped" };

  try {
    const check = await vitalpayValidateBillAccount(serviceId, account);
    if (check.valid) {
      return { state: "ok", customerName: check.customerName, accountNumber: check.accountNumber };
    }
    if (check.reason === "invalid_account") return { state: "invalid", message: check.message };
    return { state: "skipped" };
  } catch {
    return { state: "skipped" };
  }
}

export type SendMoneyResult = { ok: true; transfer: P2pTransfer } | { ok: false; error: string };

// Instant wallet-to-wallet transfer between two existing TopMe accounts
// (unlike a gift voucher, this requires the receiver to already have an
// account — resolved by phone number via the wallet_transfer RPC).
//
// Returns a result object instead of throwing: errors thrown from Server
// Actions are masked in production ("An error occurred in the Server
// Components render"), so callers would never see the friendly message.
export async function sendMoney(receiverPhone: string, amount: number, note?: string, kind: "transfer" | "red_packet" = "transfer"): Promise<SendMoneyResult> {
  if (!(await isFeatureEnabled("p2p_transfers_enabled"))) return { ok: false, error: FRIENDLY_ERRORS.feature_disabled };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: FRIENDLY_ERRORS.not_authenticated };

  const { data, error } = await supabase.rpc("wallet_transfer", {
    p_receiver_phone: receiverPhone,
    p_amount: amount,
    p_note: note ?? null,
    p_kind: kind,
  });
  if (error) return { ok: false, error: friendlyError(error.message) };

  const transfer = data as P2pTransfer;

  revalidatePath("/wallet");
  revalidatePath("/home");

  // Notifications are strictly best-effort: the money has already moved, so a
  // failure here (missing service-role key, profile fetch, email/push) must
  // never throw — a throw would be masked in production and report a failed
  // send for a transfer that actually succeeded.
  try {
    // Receiver's email isn't visible under normal RLS from the sender's session
    // (profiles are owner-select-only) — the admin client bypasses that only
    // to send a courtesy notification, never exposing it back to the client.
    const admin = createAdminClient();
    const [{ data: senderProfile }, { data: receiverProfile }] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", user.id).single(),
      admin.from("profiles").select("email, full_name").eq("id", transfer.receiver_id).single(),
    ]);

    if (user.email) {
      const { subject, html } = moneySentEmail({ amount, receiverName: receiverProfile?.full_name || receiverPhone, kind });
      void sendEmail({ sender: "noreply", to: user.email, subject, html });
    }
    if (receiverProfile?.email) {
      const { subject, html } = moneyReceivedEmail({ amount, senderName: senderProfile?.full_name || "A TopMe user", kind });
      void sendEmail({ sender: "noreply", to: receiverProfile.email, subject, html });
    }
    // Covers both this standalone Send Money/Red Packet flow and the
    // chat-embedded one (sendMoneyMessage in chat.ts calls this same
    // function) from one place, instead of notifying twice.
    void sendPushToUser(admin, transfer.receiver_id, {
      title: senderProfile?.full_name || "TopMe",
      body: kind === "red_packet" ? "Sent you a red packet 🧧" : `Sent you $${amount.toFixed(2)}`,
      url: "/wallet",
    });
  } catch {
    /* notification failure must not fail a completed transfer */
  }

  return { ok: true, transfer };
}
