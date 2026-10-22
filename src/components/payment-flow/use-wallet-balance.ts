"use client";

import { useEffect, useState } from "react";

/**
 * Checkout reads the wallet in the browser so a slow balance query cannot
 * take down the pay page. `null` means the balance is not known yet — callers
 * must not treat that as $0, or a customer with funds is shown a false
 * "insufficient balance" warning until the request returns (or forever, if
 * it fails). The server still refuses a debit the wallet cannot cover.
 */
export function useWalletBalance(initial: number | null, enabled = true): number | null {
  const [balance, setBalance] = useState<number | null>(initial);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch("/api/wallet/balance")
      .then(async (response) => {
        if (!response.ok) throw new Error("balance");
        return response.json() as Promise<{ balance?: unknown }>;
      })
      .then((data) => {
        if (cancelled) return;
        const value = typeof data.balance === "number" ? data.balance : Number(data.balance);
        setBalance(Number.isFinite(value) ? value : null);
      })
      .catch(() => {
        if (!cancelled) setBalance(null);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return balance;
}
