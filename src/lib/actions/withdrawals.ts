"use server";

import { revalidatePath } from "next/cache";
import { revalidateAdminPath } from "@/lib/actions/admin-cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";

export const WITHDRAWAL_RAILS = ["bank_transfer", "zipit", "ecocash", "innbucks", "omari"] as const;
export type WithdrawalRail = (typeof WITHDRAWAL_RAILS)[number];

export const RAIL_LABEL: Record<WithdrawalRail, string> = {
  bank_transfer: "Bank transfer",
  zipit: "ZIPIT",
  ecocash: "EcoCash",
  innbucks: "InnBucks",
  omari: "O'mari",
};

const FRIENDLY: Record<string, string> = {
  not_authenticated: "Please log in again.",
  invalid_rail: "Choose a valid payout method.",
  below_minimum: "That's below the minimum withdrawal amount.",
  missing_rail_details: "Fill in the payout account details.",
  wallet_not_found: "We couldn't find your wallet.",
  insufficient_withdrawable_balance: "You don't have that much withdrawable balance. Gift-voucher balance can't be withdrawn.",
  too_late_to_cancel: "This withdrawal is already being processed and can't be cancelled.",
  already_decided: "This withdrawal has already been handled.",
  not_approved: "This withdrawal isn't approved yet.",
  forbidden: "You don't have permission to do that.",
  withdrawal_not_found: "That withdrawal couldn't be found.",
};
const friendly = (m: string) => FRIENDLY[Object.keys(FRIENDLY).find((k) => m.includes(k)) ?? ""] ?? "Something went wrong. Please try again.";

// ---- customer ----

export async function requestWithdrawal(input: { amount: number; rail: WithdrawalRail; railDetails: Record<string, string> }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_withdrawal", {
    p_amount: input.amount,
    p_rail: input.rail,
    p_rail_details: input.railDetails,
  });
  if (error) throw new Error(friendly(error.message));
  revalidatePath("/wallet");
  return data;
}

export async function cancelWithdrawal(withdrawalId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_withdrawal", { p_id: withdrawalId });
  if (error) throw new Error(friendly(error.message));
  revalidatePath("/wallet");
  return data;
}

// ---- staff ----

export async function decideWithdrawal(withdrawalId: string, approve: boolean, note: string) {
  await requirePermission("wallet.adjust");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("decide_withdrawal", {
    p_id: withdrawalId,
    p_approve: approve,
    p_note: note || null,
  });
  if (error) throw new Error(friendly(error.message));
  revalidateAdminPath("/withdrawals");
  return data;
}

export async function markWithdrawalPaid(withdrawalId: string, externalRef: string, note: string) {
  await requirePermission("wallet.adjust");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_withdrawal_paid", {
    p_id: withdrawalId,
    p_external_ref: externalRef || null,
    p_note: note || null,
  });
  if (error) throw new Error(friendly(error.message));
  revalidateAdminPath("/withdrawals");
  return data;
}
