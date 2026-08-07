import { VersionTrackerBody } from "@/app/admin/settings/versions/body";

export default async function SuperAdminVersionTrackerPage() {
  return VersionTrackerBody({ basePath: "/super-admin" });
}
