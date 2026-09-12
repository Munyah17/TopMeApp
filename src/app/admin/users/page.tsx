import { Icon } from "@/components/icons";
import { CustomersClient } from "@/components/admin/customers-client";
import { getAllProfiles } from "@/lib/data/queries";
import { getMyPermissions } from "@/lib/auth/permissions";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [params, permissions] = await Promise.all([searchParams, getMyPermissions()]);
  if (!permissions.includes("users.view")) {
    return <div className="muted">You don&apos;t have permission to view customer accounts.</div>;
  }

  const customers = await getAllProfiles(params.q);

  return (
    <div>
      <h2 style={{ fontSize: 19 }}>User Management</h2>
      <div className="muted mb-3" style={{ lineHeight: 1.5 }}>
        Search any customer by name, phone, or email. Suspending an account blocks sign-in
        immediately and can be reversed anytime. Super Admin accounts can&apos;t be suspended here.
      </div>

      <form method="get" className="row gap-2 mb-3">
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "#fff",
            border: "1.5px solid var(--border)",
            borderRadius: 14,
            padding: "11px 14px",
          }}
        >
          <Icon name="search" size={16} stroke={2} />
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search by name, phone, or email"
            style={{ border: "none", outline: "none", fontFamily: "inherit", fontWeight: 600, fontSize: 13.5, flex: 1, background: "transparent" }}
          />
        </div>
        <button type="submit" className="backbtn tap" style={{ width: 44, height: 44 }}>
          <Icon name="search" size={17} stroke={2} />
        </button>
      </form>

      <CustomersClient customers={customers} />
    </div>
  );
}
