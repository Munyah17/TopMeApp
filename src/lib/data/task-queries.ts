import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AdminTask, Profile } from "@/types/database";

export interface AdminTaskWithNames extends AdminTask {
  assigned_to_profile: Pick<Profile, "id" | "full_name"> | null;
}

export async function getTasks(status?: string): Promise<AdminTaskWithNames[]> {
  const supabase = await createClient();
  let query = supabase.from("admin_tasks").select("*").order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data } = await query;
  const rows = (data as AdminTask[]) ?? [];
  if (rows.length === 0) return [];

  const ids = Array.from(new Set(rows.map((t) => t.assigned_to).filter((id): id is string => !!id)));
  const { data: profiles } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  const byId = new Map(((profiles as Profile[]) ?? []).map((p) => [p.id, p]));

  return rows.map((t) => ({ ...t, assigned_to_profile: t.assigned_to ? byId.get(t.assigned_to) ?? null : null }));
}

export async function getStaffProfiles(): Promise<Pick<Profile, "id" | "full_name" | "email">[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, full_name, email").in("role", ["admin", "superadmin"]);
  return (data as Pick<Profile, "id" | "full_name" | "email">[]) ?? [];
}
