import { AdminOverviewBody } from "./body";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ range?: string; cards?: string }> }) {
  return AdminOverviewBody({ basePath: "/admin", searchParams });
}
