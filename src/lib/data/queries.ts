import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  Beneficiary,
  DataBundle,
  Favorite,
  Network,
  Profile,
  Service,
  ServiceCategory,
  Transaction,
  TvPackage,
  Wallet,
} from "@/types/database";

export async function getNetworks(): Promise<Network[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("networks").select("*");
  return (data as Network[]) ?? [];
}

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return (data as Profile) ?? null;
}

export async function getWallet(userId: string): Promise<Wallet | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("wallets").select("*").eq("user_id", userId).single();
  return (data as Wallet) ?? null;
}

export async function getCategories(): Promise<ServiceCategory[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("service_categories").select("*").order("sort_order");
  return (data as ServiceCategory[]) ?? [];
}

export async function getCategory(id: string): Promise<ServiceCategory | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("service_categories").select("*").eq("id", id).single();
  return (data as ServiceCategory) ?? null;
}

export async function getServicesByCategory(categoryId: string): Promise<Service[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("services")
    .select("*")
    .eq("category_id", categoryId)
    .order("sort_order");
  return (data as Service[]) ?? [];
}

export async function getAllServices(): Promise<Service[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("services").select("*").order("sort_order");
  return (data as Service[]) ?? [];
}

export async function getService(id: string): Promise<Service | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("services").select("*").eq("id", id).single();
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

export async function getBeneficiaries(userId: string): Promise<Beneficiary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("beneficiaries")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return (data as Beneficiary[]) ?? [];
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
