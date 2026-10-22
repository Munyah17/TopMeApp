import { NextResponse } from "next/server";
import { getMyPermissions } from "@/lib/auth/permissions";
import type { PermissionKey } from "@/lib/auth/permission-keys";

/** Null when the signed-in staff member holds one of the permissions. */
export async function staffApiDenied(permissions: PermissionKey[]): Promise<NextResponse | null> {
  const held = await getMyPermissions();
  if (held.length === 0) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!permissions.some((permission) => held.includes(permission))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
