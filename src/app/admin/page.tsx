import { AdminOverviewBody } from "./body";

export default async function AdminPage() {
  return AdminOverviewBody({ basePath: "/admin" });
}
