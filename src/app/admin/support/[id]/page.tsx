import { SupportDetailBody } from "./body";

export default async function SupportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return SupportDetailBody({ id, basePath: "/admin" });
}
