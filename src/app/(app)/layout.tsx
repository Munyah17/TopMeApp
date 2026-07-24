import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell/shell";
import { getCurrentUser, getCurrentProfile } from "@/lib/data/queries";

export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const profile = await getCurrentProfile();
  return <AppShell profile={profile}>{children}</AppShell>;
}
