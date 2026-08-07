import { TransactionDetailBody } from "@/app/admin/transactions/[id]/body";

export default async function SuperAdminTransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return TransactionDetailBody({ id, basePath: "/super-admin" });
}
