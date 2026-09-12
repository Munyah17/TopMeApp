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
      <WithdrawalsClient withdrawals={withdrawals} />
    </div>
  );
}
