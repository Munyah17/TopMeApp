import { AdminOverviewBody } from "@/app/admin/body";

export default async function SuperAdminPage({ searchParams }: { searchParams: Promise<{ range?: string; cards?: string }> }) {
  return AdminOverviewBody({ basePath: "/super-admin", searchParams });
}
