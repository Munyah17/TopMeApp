import Link from "next/link";
import { Icon } from "@/components/icons";
import { ApiModulesClient } from "@/components/admin/api-modules-client";
import { getCurrentProfile } from "@/lib/data/queries";
import { createClient } from "@/lib/supabase/server";
import type { ApiModuleSafe } from "@/types/database";

export default async function ApiManagementPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  if (profile.role !== "superadmin") {
    return (
      <div>
        <div className="topbar">
          <Link href="/account" className="backbtn tap" style={{ textDecoration: "none" }}>
            <Icon name="chevronL" size={18} stroke={2.2} />
          </Link>
          <div style={{ fontWeight: 700, fontSize: 15.5 }}>APIs Management</div>
        </div>
        <div className="px content-wrap">
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "50px 20px" }}>
            <div style={{ width: 74, height: 74, borderRadius: 22, background: "#F1F4F9", color: "var(--text-faint)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="lock" size={32} stroke={1.6} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, marginTop: 16 }}>Super Admin only</div>
            <div className="muted mt-1" style={{ maxWidth: 260 }}>
              Only Super Admin accounts can manage API integrations.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase.from("api_modules_safe").select("*").order("created_at", { ascending: false });
  const modules = (data as ApiModuleSafe[]) ?? [];

  return (
    <div>
      <div className="topbar">
        <Link href="/admin" className="backbtn tap" style={{ textDecoration: "none" }}>
          <Icon name="chevronL" size={18} stroke={2.2} />
        </Link>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15.5 }}>APIs Management</div>
        </div>
      </div>
      <div className="px content-wrap">
        <div className="muted mb-3" style={{ lineHeight: 1.5 }}>
          Every product on TopMe is powered by an API module. Add a key to bring a new biller online, or toggle one
          off without removing it. Fulfillment falls back to a clearly-labeled simulated provider whenever no
          matching module is active.
        </div>
        <ApiModulesClient modules={modules} />
      </div>
    </div>
  );
}
