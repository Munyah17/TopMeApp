import { DisputesBody } from "@/app/admin/disputes/body";

export default async function SuperAdminDisputesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  return DisputesBody({ searchParams, basePath: "/super-admin" });
}
