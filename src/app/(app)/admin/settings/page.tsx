import { SettingsClient } from "@/components/admin/settings-client";
import { getMyPermissions } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const permissions = await getMyPermissions();
  if (!permissions.includes("settings.manage")) {
    return <div className="muted">You don&apos;t have permission to view global settings.</div>;
  }

  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("*").order("key");

  return (
    <div>
      <h2 style={{ fontSize: 19 }}>Global Settings</h2>
      <div className="muted mb-3">Platform-wide configuration. Changes apply immediately.</div>
      <SettingsClient settings={data ?? []} />
    </div>
  );
}
