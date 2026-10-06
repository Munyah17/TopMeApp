import { normalizeRecipient, sendAirtime, smsConfigured } from "@/lib/sms/txtzw";
import type { FulfillmentInput, FulfillmentProvider, FulfillmentResult } from "./types";

/** Whether DirectRecharge can be selected safely. Credentials are shared
 * with TXT SMS, but airtime can be disabled independently while SMS stays
 * live (TXTZW_AIRTIME_ENABLED=true is an explicit operational switch). */
export function txtZwAirtimeConfigured(): boolean {
  return smsConfigured() && process.env.TXTZW_AIRTIME_ENABLED === "true";
}

function validZimbabweMobile(value: string): boolean {
  return /^2637\d{8}$/.test(normalizeRecipient(value));
}

/** txt.co.zw pinless DirectRecharge provider. The endpoint is synchronous:
 * SUCCESS means airtime was accepted; ERROR throws from the TXT client and
 * the existing payment flow records failure/refund rather than pretending
 * delivery succeeded. */
export class TxtZwAirtimeProvider implements FulfillmentProvider {
  readonly name = "txtzw";
  readonly coverage = ["airtime"] as const;

  async fulfil(input: FulfillmentInput): Promise<FulfillmentResult> {
    if (!txtZwAirtimeConfigured()) {
      throw new Error("txt.co.zw airtime is not configured or enabled.");
    }
    if (!validZimbabweMobile(input.recipient)) {
      return { status: "failed", message: "Enter a valid Zimbabwe mobile number." };
    }
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      return { status: "failed", message: "Airtime amount must be greater than zero." };
    }

    const recipient = normalizeRecipient(input.recipient);
    const providerRef = await sendAirtime(recipient, input.amount);
    return {
      status: "fulfilled",
      providerRef,
      message: `Airtime delivered to ${recipient}.`,
      extra: {
        recipient,
        currency: (process.env.TXTZW_HOST || "www.txt.co.zw").toLowerCase().includes("usd.") ? "USD" : "ZWG",
        direct_recharge: true,
      },
    };
  }
}
