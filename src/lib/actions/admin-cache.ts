import "server-only";
import { revalidatePath } from "next/cache";

// /admin and /super-admin are two separate route trees rendering the same
// underlying page content (see src/app/admin, src/app/super-admin) — Next
// only invalidates the exact path it's given, so every admin mutation has
// to revalidate both portals or whichever one you're NOT currently in goes
// stale until a manual refresh.
export function revalidateAdminPath(path: string) {
  revalidatePath(`/admin${path}`);
  revalidatePath(`/super-admin${path}`);
}
