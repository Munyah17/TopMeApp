"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import type { TicketStatus, TicketPriority } from "@/types/database";

export async function assignTicket(ticketId: string, assigneeId: string | null) {
  const { supabase } = await requirePermission("support.manage");
  const { error } = await supabase.from("support_tickets").update({ assigned_to: assigneeId, updated_at: new Date().toISOString() }).eq("id", ticketId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/support/${ticketId}`);
  revalidatePath("/admin/support");
}

export async function setTicketStatus(ticketId: string, status: TicketStatus) {
  const { supabase } = await requirePermission("support.manage");
  const { error } = await supabase.from("support_tickets").update({ status, updated_at: new Date().toISOString() }).eq("id", ticketId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/support/${ticketId}`);
  revalidatePath("/admin/support");
}

export async function setTicketPriority(ticketId: string, priority: TicketPriority) {
  const { supabase } = await requirePermission("support.manage");
  const { error } = await supabase.from("support_tickets").update({ priority, updated_at: new Date().toISOString() }).eq("id", ticketId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/support/${ticketId}`);
}

export async function sendTicketMessage(ticketId: string, body: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const trimmed = body.trim();
  if (!trimmed) return;

  const { error } = await supabase.from("support_ticket_messages").insert({ ticket_id: ticketId, sender_id: user?.id ?? null, body: trimmed });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/support/${ticketId}`);
}
