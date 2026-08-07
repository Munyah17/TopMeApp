import { DisputeDetailBody } from "./body";

export default async function DisputeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return DisputeDetailBody({ id, basePath: "/admin" });
}
