import { SupportBody } from "@/app/admin/support/body";

export default async function SuperAdminSupportPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  return SupportBody({ searchParams, basePath: "/super-admin" });
}
