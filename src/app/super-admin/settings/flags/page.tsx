import { FeatureFlagsBody } from "@/app/admin/settings/flags/body";

export default async function SuperAdminFeatureFlagsPage() {
  return FeatureFlagsBody({ basePath: "/super-admin" });
}
