import { OperationsBody } from "./body";

export default async function OperationsPage() {
  return OperationsBody({ basePath: "/admin" });
}
