import "server-only";
import { createClient } from "@/lib/supabase/server";

// Public, narrow gate — safe for guest/anon callers too (get_public_flag is
// granted to anon). Defaults true when a key is unseeded so a future flag
// never silently disables something nobody wired a row for.
export async function isFeatureEnabled(key: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_flag", { p_key: key });
  if (error) return true;
  return data ?? true;
}

export async function getPublicSetting<T = unknown>(key: string): Promise<T | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_public_setting", { p_key: key });
  return (data as T) ?? null;
}
