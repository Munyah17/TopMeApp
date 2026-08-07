import { AdminOverviewBody } from "@/app/admin/body";

export default async function SuperAdminPage() {
  return AdminOverviewBody({ basePath: "/super-admin" });
}
