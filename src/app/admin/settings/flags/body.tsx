import Link from "next/link";
import { Icon } from "@/components/icons";
import { FlagsClient } from "@/components/admin/flags-client";
import { getMyPermissions } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

export async function FeatureFlagsBody({ basePath }: { basePath: string }) {
  const permissions = await getMyPermissions();
  if (!permissions.includes("flags.manage")) {
    return <div className="muted">You don&apos;t have permission to view feature flags.</div>;
  }

  const supabase = await createClient();
  const { data } = await supabase.from("feature_flags").select("*").order("key");

  return (
    <div>
      <Link href={`${basePath}/settings`} className="row gap-2" style={{ textDecoration: "none", color: "var(--text-soft)", marginBottom: 12, fontSize: 13, fontWeight: 700 }}>
        <Icon name="chevronL" size={15} stroke={2.2} /> Back to Settings
      </Link>
      <h2 style={{ fontSize: 19 }}>Feature Flags</h2>
      <div className="muted mb-3">Master switches for optional features. Off means genuinely off, not simulated.</div>
      <FlagsClient flags={data ?? []} />
    </div>
  );
}
