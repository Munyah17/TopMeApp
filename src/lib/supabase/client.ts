import { createBrowserClient } from "@supabase/ssr";

// No generic <Database> param here — Supabase's generated-type inference has
// sharp edges that turn queries into `never` in some join/select shapes.
// Cast to the app's own types at the call site instead (see src/types/database.ts).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
