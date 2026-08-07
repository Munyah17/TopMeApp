import { PaymentBannersClient } from "@/components/admin/payment-banners-client";
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
  const rows = data ?? [];
  const bannerRow = rows.find((r) => r.key === "payment_method_banners");
  const otherRows = rows.filter((r) => r.key !== "payment_method_banners");

  return (
    <div>
      <h2 style={{ fontSize: 19 }}>Global Settings</h2>
      <div className="muted mb-3">Platform-wide configuration. Changes apply immediately.</div>
      <SettingsClient settings={otherRows} />

      <div className="section-title mt-3 mb-2">Payment method banners</div>
      <div className="muted mb-2" style={{ fontSize: 12.5 }}>
        Upload a real brand banner for Paynow, EcoCash, and Stripe on the checkout screen. Wallet Balance has no
        third-party brand, so it&apos;s always the plain button.
      </div>
      <PaymentBannersClient banners={(bannerRow?.value as Record<string, string>) ?? {}} />
    </div>
  );
}
