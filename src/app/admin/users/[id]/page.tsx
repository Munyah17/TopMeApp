import { UserDetailBody } from "./body";

// Shows a real wallet balance — never statically rendered or fetch-cached.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return UserDetailBody({ id, basePath: "/admin" });
}
