import { UserDetailBody } from "./body";

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return UserDetailBody({ id, basePath: "/admin" });
}
