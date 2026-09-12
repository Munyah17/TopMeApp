import { StaffMemberBody } from "./body";

export default async function StaffMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return StaffMemberBody({ id, basePath: "/admin" });
}
