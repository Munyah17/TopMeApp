import { SupportDetailBody } from "@/app/admin/support/[id]/body";

export default async function SuperAdminSupportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return SupportDetailBody({ id, basePath: "/super-admin" });
}
