import { DisputesBody } from "./body";

export default async function DisputesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  return DisputesBody({ searchParams, basePath: "/admin" });
}
