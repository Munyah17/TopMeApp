import { DisputeDetailBody } from "@/app/admin/disputes/[id]/body";

export default async function SuperAdminDisputeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return DisputeDetailBody({ id, basePath: "/super-admin" });
}
