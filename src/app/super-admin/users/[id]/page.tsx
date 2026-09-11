import { UserDetailBody } from "@/app/admin/users/[id]/body";

// Shows a real wallet balance — never statically rendered or fetch-cached.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function SuperAdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return UserDetailBody({ id, basePath: "/super-admin" });
}
