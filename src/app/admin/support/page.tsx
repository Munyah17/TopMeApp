import { SupportBody } from "./body";

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  return SupportBody({ searchParams, basePath: "/admin" });
}
