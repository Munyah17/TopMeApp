import { TransactionDetailBody } from "./body";

export default async function TransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return TransactionDetailBody({ id, basePath: "/admin" });
}
