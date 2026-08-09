import { notFound } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { TransactionDetail } from "@/components/admin/transaction-detail";
import { getTransactionDetail, getTransactionTimeline } from "@/lib/data/admin-queries";
import { getMyPermissions } from "@/lib/auth/permissions";

export async function TransactionDetailBody({ id, basePath }: { id: string; basePath: string }) {
  const permissions = await getMyPermissions();
  if (!permissions.includes("transactions.view")) {
    return <div className="muted">You don&apos;t have permission to view transactions.</div>;
  }

  const { transaction, ledgerRows } = await getTransactionDetail(id);
  if (!transaction) notFound();
  const timeline = await getTransactionTimeline(id, transaction.reference);

  return (
    <div>
      <Link href={`${basePath}/transactions`} className="row gap-2" style={{ textDecoration: "none", color: "var(--text-soft)", marginBottom: 12, fontSize: 13, fontWeight: 700 }}>
        <Icon name="chevronL" size={15} stroke={2.2} /> Back to Transactions
      </Link>
      <TransactionDetail transaction={transaction} ledgerRows={ledgerRows} timeline={timeline} />
    </div>
  );
}
