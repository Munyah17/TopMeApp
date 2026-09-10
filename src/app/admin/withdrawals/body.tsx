import { WithdrawalsClient } from "@/components/admin/withdrawals-client";
import { getWithdrawals } from "@/lib/data/admin-queries";
import { getMyPermissions } from "@/lib/auth/permissions";

export async function WithdrawalsBody() {
  const permissions = await getMyPermissions();
  if (!permissions.includes("wallet.adjust")) {
    return <div className="muted">You don&apos;t have permission to handle withdrawals.</div>;
  }
  const withdrawals = await getWithdrawals(30);

  return (
    <div>
      <h2 style={{ fontSize: 19 }}>Withdrawals</h2>
      <div className="muted mb-3" style={{ lineHeight: 1.5 }}>
        Customers cash TopMe balance out to a local rail (bank, ZIPIT, EcoCash, InnBucks, O&apos;mari) for a
        1.3% fee. The amount already left their wallet when they requested it. Approve, then pay them on the
        rail and mark it paid. Rejecting returns the full amount to their wallet.
      </div>
      <WithdrawalsClient withdrawals={withdrawals} />
    </div>
  );
}
