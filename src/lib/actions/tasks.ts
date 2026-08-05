"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/permissions";
import type { TaskStatus, TicketPriority } from "@/types/database";

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority: TicketPriority;
  assignedTo?: string | null;
  dueAt?: string | null;
}

export async function createTask(input: CreateTaskInput) {
  const { supabase, user } = await requirePermission("tasks.manage");
  const { error } = await supabase.from("admin_tasks").insert({
    title: input.title,
    description: input.description || null,
    priority: input.priority,
    assigned_to: input.assignedTo || null,
    created_by: user.id,
    due_at: input.dueAt || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/tasks");
}

export async function setTaskStatus(taskId: string, status: TaskStatus) {
  const { supabase } = await requirePermission("tasks.manage");
  const patch: { status: TaskStatus; updated_at: string; completed_at?: string | null } = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === "done") patch.completed_at = new Date().toISOString();
  const { error } = await supabase.from("admin_tasks").update(patch).eq("id", taskId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/tasks");
}

export async function reassignTask(taskId: string, assigneeId: string | null) {
  const { supabase } = await requirePermission("tasks.manage");
  const { error } = await supabase.from("admin_tasks").update({ assigned_to: assigneeId, updated_at: new Date().toISOString() }).eq("id", taskId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/tasks");
}
