"use server";

import { revalidateAdminPath } from "@/lib/actions/admin-cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import type { Dispute, DisputeStatus } from "@/types/database";

export async function assignDispute(disputeId: string, assigneeId: string | null) {
  const { supabase } = await requirePermission("disputes.manage");
  const { error } = await supabase.from("disputes").update({ assigned_to: assigneeId, updated_at: new Date().toISOString() }).eq("id", disputeId);
  if (error) throw new Error(error.message);
  revalidateAdminPath(`/disputes/${disputeId}`);
  revalidateAdminPath("/disputes");
}

export async function setDisputeStatus(disputeId: string, status: DisputeStatus, resolutionNote?: string) {
  const { supabase, user } = await requirePermission("disputes.manage");
  const patch: Partial<Dispute> & { updated_at: string } = { status, updated_at: new Date().toISOString() };
  if (resolutionNote !== undefined) patch.resolution_note = resolutionNote || null;
  if (status === "resolved" || status === "rejected") patch.resolved_at = new Date().toISOString();

  const { error } = await supabase.from("disputes").update(patch).eq("id", disputeId);
  if (error) throw new Error(error.message);

  const admin = createAdminClient();
  await admin.from("admin_audit_log").insert({
    actor_id: user.id,
    action: "dispute.set_status",
    target_table: "disputes",
    target_id: disputeId,
    meta: { status, resolutionNote },
  });

  revalidateAdminPath(`/disputes/${disputeId}`);
  revalidateAdminPath("/disputes");
}

export async function sendDisputeMessage(disputeId: string, body: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  const trimmed = body.trim();
  if (!trimmed) return;

  const { error } = await supabase.from("dispute_messages").insert({ dispute_id: disputeId, sender_id: user.id, body: trimmed });
  if (error) throw new Error(error.message);
  revalidateAdminPath(`/disputes/${disputeId}`);
}
