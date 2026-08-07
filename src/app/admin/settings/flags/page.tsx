import { FeatureFlagsBody } from "./body";

export default async function FeatureFlagsPage() {
  return FeatureFlagsBody({ basePath: "/admin" });
}
