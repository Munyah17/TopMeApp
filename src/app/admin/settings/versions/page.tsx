import { VersionTrackerBody } from "./body";

export default async function VersionTrackerPage() {
  return VersionTrackerBody({ basePath: "/admin" });
}
