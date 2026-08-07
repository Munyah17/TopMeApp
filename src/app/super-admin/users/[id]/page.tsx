import { UserDetailBody } from "@/app/admin/users/[id]/body";

export default async function SuperAdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return UserDetailBody({ id, basePath: "/super-admin" });
}
