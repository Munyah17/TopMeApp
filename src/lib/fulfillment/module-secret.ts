import { decryptSecret } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * API modules saved in Admin → APIs store one secret per provider, encrypted
 * with API_ENCRYPTION_KEY. Checkout used to ignore that column and only read
 * process.env, so a module added in the dashboard never actually connected.
 * Env credentials still win when they are set. A decrypt failure is logged
 * and treated as "no stored key" so a bad ciphertext cannot take down a
 * provider that still has an env key.
 */
export async function readModuleSecret(provider: string): Promise<string | null> {
  const name = provider.trim().toLowerCase();
  if (!name) return null;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("api_modules")
      .select("key_encrypted")
      .eq("provider", name)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data?.key_encrypted) return null;
    return decryptSecret(data.key_encrypted);
  } catch (error) {
    console.error(
      `Stored API key for "${name}" could not be read:`,
      error instanceof Error ? error.message : "decrypt failed"
    );
    return null;
  }
}
