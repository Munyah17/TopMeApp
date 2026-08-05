import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Dispute, DisputeMessage, Profile } from "@/types/database";

export interface DisputeWithNames extends Dispute {
  raised_by_profile: Pick<Profile, "id" | "full_name" | "phone"> | null;
  assigned_to_profile: Pick<Profile, "id" | "full_name"> | null;
}

export async function getDisputes(status?: string): Promise<DisputeWithNames[]> {
  const supabase = await createClient();
  let query = supabase.from("disputes").select("*").order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data } = await query;
  const rows = (data as Dispute[]) ?? [];
  if (rows.length === 0) return [];

  const profileIds = Array.from(new Set(rows.flatMap((d) => [d.raised_by, d.assigned_to]).filter((id): id is string => !!id)));
  const { data: profiles } = await supabase.from("profiles").select("id, full_name, phone").in("id", profileIds);
  const byId = new Map(((profiles as Profile[]) ?? []).map((p) => [p.id, p]));

  return rows.map((d) => ({
    ...d,
    raised_by_profile: d.raised_by ? byId.get(d.raised_by) ?? null : null,
    assigned_to_profile: d.assigned_to ? byId.get(d.assigned_to) ?? null : null,
  }));
}

export async function getDispute(id: string): Promise<DisputeWithNames | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("disputes").select("*").eq("id", id).single();
  const dispute = data as Dispute | null;
  if (!dispute) return null;

  const profileIds = [dispute.raised_by, dispute.assigned_to].filter((id): id is string => !!id);
  const { data: profiles } = profileIds.length ? await supabase.from("profiles").select("id, full_name, phone").in("id", profileIds) : { data: [] };
  const byId = new Map(((profiles as Profile[]) ?? []).map((p) => [p.id, p]));

  return {
    ...dispute,
    raised_by_profile: dispute.raised_by ? byId.get(dispute.raised_by) ?? null : null,
    assigned_to_profile: dispute.assigned_to ? byId.get(dispute.assigned_to) ?? null : null,
  };
}

export async function getDisputeMessages(disputeId: string): Promise<DisputeMessage[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("dispute_messages").select("*").eq("dispute_id", disputeId).order("created_at", { ascending: true });
  return (data as DisputeMessage[]) ?? [];
}
