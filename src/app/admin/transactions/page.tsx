import { TransactionsBody } from "./body";

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; fulfillment?: string }> }) {
  return TransactionsBody({ searchParams, basePath: "/admin" });
}
