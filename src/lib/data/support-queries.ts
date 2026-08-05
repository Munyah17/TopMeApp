import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Profile, SupportTicket, SupportTicketMessage } from "@/types/database";

export interface SupportTicketWithNames extends SupportTicket {
  user_profile: Pick<Profile, "id" | "full_name" | "phone" | "email"> | null;
  assigned_to_profile: Pick<Profile, "id" | "full_name"> | null;
}

export async function getSupportTickets(status?: string): Promise<SupportTicketWithNames[]> {
  const supabase = await createClient();
  let query = supabase.from("support_tickets").select("*").order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data } = await query;
  const rows = (data as SupportTicket[]) ?? [];
  if (rows.length === 0) return [];

  const profileIds = Array.from(new Set(rows.flatMap((t) => [t.user_id, t.assigned_to]).filter((id): id is string => !!id)));
  const { data: profiles } = profileIds.length
    ? await supabase.from("profiles").select("id, full_name, phone, email").in("id", profileIds)
    : { data: [] };
  const byId = new Map(((profiles as Profile[]) ?? []).map((p) => [p.id, p]));

  return rows.map((t) => ({
    ...t,
    user_profile: t.user_id ? byId.get(t.user_id) ?? null : null,
    assigned_to_profile: t.assigned_to ? byId.get(t.assigned_to) ?? null : null,
  }));
}

export async function getSupportTicket(id: string): Promise<SupportTicketWithNames | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("support_tickets").select("*").eq("id", id).single();
  const ticket = data as SupportTicket | null;
  if (!ticket) return null;

  const profileIds = [ticket.user_id, ticket.assigned_to].filter((id): id is string => !!id);
  const { data: profiles } = profileIds.length
    ? await supabase.from("profiles").select("id, full_name, phone, email").in("id", profileIds)
    : { data: [] };
  const byId = new Map(((profiles as Profile[]) ?? []).map((p) => [p.id, p]));

  return {
    ...ticket,
    user_profile: ticket.user_id ? byId.get(ticket.user_id) ?? null : null,
    assigned_to_profile: ticket.assigned_to ? byId.get(ticket.assigned_to) ?? null : null,
  };
}

export async function getSupportTicketMessages(ticketId: string): Promise<SupportTicketMessage[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("support_ticket_messages").select("*").eq("ticket_id", ticketId).order("created_at", { ascending: true });
  return (data as SupportTicketMessage[]) ?? [];
}
