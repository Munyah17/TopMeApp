import { RefundsClient } from "@/components/admin/refunds-client";
import { getRefundRequests } from "@/lib/data/admin-queries";
import { getMyPermissions } from "@/lib/auth/permissions";

export async function RefundsBody({ basePath }: { basePath: string }) {
  const permissions = await getMyPermissions();
  if (!permissions.includes("transactions.rectify")) {
    return <div className="muted">You don&apos;t have permission to handle refunds.</div>;
  }

  const refunds = await getRefundRequests(30);

  return (
    <div>
      <h2 style={{ fontSize: 19 }}>Refunds</h2>
      <RefundsClient refunds={refunds} basePath={basePath} />
    </div>
  );
}
