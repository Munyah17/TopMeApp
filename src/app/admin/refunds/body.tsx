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
      <div className="muted mb-3" style={{ lineHeight: 1.5 }}>
        A refund is raised automatically whenever a payment succeeds but the order can&apos;t be
        delivered. Wallet failures of $49 or less are refunded on the spot; anything larger, and
        every guest checkout, waits here for your decision. Refunds always go to the customer&apos;s
        TopMe wallet — never reversed to Paynow/EcoCash/card.
      </div>
      <RefundsClient refunds={refunds} basePath={basePath} />
    </div>
  );
}
