import { TransactionsBody } from "@/app/admin/transactions/body";

export default async function SuperAdminTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; fulfillment?: string }>;
}) {
  return TransactionsBody({ searchParams, basePath: "/super-admin" });
}
