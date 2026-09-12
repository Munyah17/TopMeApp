import { StaffMemberBody } from "@/app/admin/staff/[id]/body";

export default async function SuperAdminStaffMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return StaffMemberBody({ id, basePath: "/super-admin" });
}
