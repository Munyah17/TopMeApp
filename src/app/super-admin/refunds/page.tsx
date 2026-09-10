import { RefundsBody } from "@/app/admin/refunds/body";

export default async function RefundsPage() {
  return RefundsBody({ basePath: "/super-admin" });
}
