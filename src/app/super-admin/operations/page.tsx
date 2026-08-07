import { OperationsBody } from "@/app/admin/operations/body";

export default async function SuperAdminOperationsPage() {
  return OperationsBody({ basePath: "/super-admin" });
}
