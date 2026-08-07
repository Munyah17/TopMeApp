import { ApiModulesClient } from "@/components/admin/api-modules-client";
import { getMyPermissions } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import type { ApiModuleSafe } from "@/types/database";

export default async function ApiManagementPage() {
  const permissions = await getMyPermissions();
  if (!permissions.includes("apis.manage")) {
    return <div className="muted">You don&apos;t have permission to manage API integrations.</div>;
  }

  const supabase = await createClient();
  const { data } = await supabase.from("api_modules_safe").select("*").order("created_at", { ascending: false });
  const modules = (data as ApiModuleSafe[]) ?? [];

  return (
    <div>
      <h2 style={{ fontSize: 19 }}>APIs Management</h2>
      <div className="muted mb-3" style={{ lineHeight: 1.5 }}>
        Every product on TopMe is powered by an API module. Add a key to bring a new biller online, or toggle one
        off without removing it. A service with no active module behind it is declined upfront as
        &quot;Temporarily Not Available&quot; — it never fakes a purchase.
      </div>
      <ApiModulesClient modules={modules} />
    </div>
  );
}
