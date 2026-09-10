import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type {
  Beneficiary,
  DataBundle,
  Favorite,
  Network,
  Profile,
  ProfileLookup,
  PromoBanner,
  Service,
  ServiceCategory,
  Transaction,
  TvPackage,
  Wallet,
} from "@/types/database";

// Networks/categories/all-services barely ever change (an admin editing the
// catalog is rare; every customer loading /home, /services, or /pay/[id]
// re-querying them from scratch on every single page view was pure added
// latency for data that's identical across everyone). unstable_cache holds
// these server-wide with a 5-minute safety-net revalidation, but the real
// invalidation is immediate: every catalog-mutating admin action calls
// revalidateTag("catalog") (see revalidateCatalog() in src/lib/actions/
// admin.ts) so an edit is never stale for longer than it takes to save.
// Uses the admin client deliberately — this is public catalog data (RLS
// already grants it broadly to any authenticated caller), and
// unstable_cache's callback can't depend on the current request's cookies
// the way the session-scoped client does.
// Every network in the table, active or not — for the admin/super-admin
// catalog screens only. `is_active` may be absent until the
// 2026-09-10-network-active-toggle migration runs; treat missing as true.
export const getAllNetworks = unstable_cache(
  async (): Promise<Network[]> => {
    const admin = createAdminClient();
    const { data } = await admin.from("networks").select("*");
    return ((data as Network[]) ?? []).map((n) => ({ ...n, is_active: n.is_active ?? true }));
  },
  ["networks-all"],
  { tags: ["catalog"], revalidate: 300 }
);

// Customer-facing: only networks a provider can actually fulfil right now.
export const getNetworks = unstable_cache(
  async (): Promise<Network[]> => {
    const admin = createAdminClient();
    const { data } = await admin.from("networks").select("*");
    return ((data as Network[]) ?? [])
      .map((n) => ({ ...n, is_active: n.is_active ?? true }))
      .filter((n) => n.is_active);
  },
  ["networks"],
  { tags: ["catalog"], revalidate: 300 }
);

// Cached per-request: layout.tsx and individual pages each call these, and
// without dedup that's a redundant Supabase auth round-trip on every one of
// those calls for a single page load.
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return (data as Profile) ?? null;
});

export async function getWallet(userId: string): Promise<Wallet | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("wallets").select("*").eq("user_id", userId).single();
  return (data as Wallet) ?? null;
}

export const getCategories = unstable_cache(
  async (): Promise<ServiceCategory[]> => {
    const admin = createAdminClient();
    const { data } = await admin.from("service_categories").select("*").order("sort_order");
    return (data as ServiceCategory[]) ?? [];
  },
  ["categories"],
  { tags: ["catalog"], revalidate: 300 }
);

export async function getCategory(id: string): Promise<ServiceCategory | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("service_categories").select("*").eq("id", id).single();
  return (data as ServiceCategory) ?? null;
}

export async function getActivePromoBanner(): Promise<PromoBanner | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("promo_banners")
    .select("*")
    .eq("is_active", true)
    .eq("kind", "image")
    .eq("placement", "home_top")
    .order("sort_order")
    .limit(1)
    .maybeSingle();
  return (data as PromoBanner) ?? null;
}

// Portrait promo tiles that fill the blank grid slots left when a Home
// category row has fewer products than the desktop column count — see
// .cat-widget-tile in globals.css and src/app/(app)/home/page.tsx.
export async function getGridWidgetBanners(): Promise<PromoBanner[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("promo_banners")
    .select("*")
    .eq("is_active", true)
    .eq("kind", "image")
    .eq("placement", "grid_widget")
    .order("sort_order");
  return (data as PromoBanner[]) ?? [];
}

// Text announcements (audience 'customers'|'staff'|'all') — separate from
// the single image carousel banner above, can show several at once.
export async function getActiveAnnouncements(audience: "customers" | "staff"): Promise<PromoBanner[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("promo_banners")
    .select("*")
    .eq("is_active", true)
    .eq("kind", "announcement")
    .in("audience", [audience, "all"])
    .order("sort_order");
  return (data as PromoBanner[]) ?? [];
}

export async function getAllPromoBanners(): Promise<PromoBanner[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("promo_banners").select("*").order("sort_order");
  return (data as PromoBanner[]) ?? [];
}

export async function getServicesByCategory(categoryId: string, includeInactive = false): Promise<Service[]> {
  const supabase = await createClient();
  let query = supabase.from("services").select("*").eq("category_id", categoryId);
  if (!includeInactive) query = query.eq("is_active", true);
  const { data } = await query.order("sort_order");
  return (data as Service[]) ?? [];
}

export const getAllServices = unstable_cache(
  async (includeInactive = false): Promise<Service[]> => {
    const admin = createAdminClient();
    let query = admin.from("services").select("*");
    if (!includeInactive) query = query.eq("is_active", true);
    const { data } = await query.order("sort_order");
    return (data as Service[]) ?? [];
  },
  ["all-services"],
  { tags: ["catalog"], revalidate: 300 }
);

export async function getService(id: string, includeInactive = false): Promise<Service | null> {
  const supabase = await createClient();
  let query = supabase.from("services").select("*").eq("id", id);
  if (!includeInactive) query = query.eq("is_active", true);
  const { data } = await query.single();
  return (data as Service) ?? null;
}

export async function getDataBundles(): Promise<DataBundle[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("data_bundles").select("*").order("sort_order");
  return (data as DataBundle[]) ?? [];
}

export async function getTvPackages(): Promise<TvPackage[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("tv_packages").select("*").order("sort_order");
  return (data as TvPackage[]) ?? [];
}

export async function getFavoriteServiceIds(userId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("favorites").select("service_id").eq("user_id", userId);
  return new Set(((data as Favorite[]) ?? []).map((f) => f.service_id));
}

export async function getRecentTransactions(userId: string, limit = 6): Promise<Transaction[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as Transaction[]) ?? [];
}

export async function getWalletLedger(userId: string, limit = 10) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("wallet_ledger")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as import("@/types/database").WalletLedgerRow[]) ?? [];
}

// Admin/superadmin-only listing of customer accounts (RLS's profiles_select_admin
// policy is what actually gates this — a non-staff caller just gets their own row back).
export async function getAllProfiles(search?: string): Promise<Profile[]> {
  const supabase = await createClient();
  let query = supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(200);
  if (search) {
    const term = search.trim().replace(/[%,]/g, "");
    query = query.or(`full_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`);
  }
  const { data } = await query;
  return (data as Profile[]) ?? [];
}

export async function getBeneficiaries(userId: string): Promise<Beneficiary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("beneficiaries")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return (data as Beneficiary[]) ?? [];
}

// Resolves a phone number to the minimal public profile info needed for a
// "Sending to <name>" confirmation, via the find_profile_by_phone RPC (a
// security definer function — profiles' own RLS is owner-only, so a plain
// select can't see another user's row).
export async function findProfileByPhone(phone: string): Promise<ProfileLookup | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("find_profile_by_phone", { p_phone: phone });
  const row = (data as ProfileLookup[] | null)?.[0];
  return row ?? null;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
