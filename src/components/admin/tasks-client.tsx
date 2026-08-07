"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { createTask, reassignTask, setTaskStatus } from "@/lib/actions/tasks";
import type { AdminTaskWithNames } from "@/lib/data/task-queries";
import type { Profile, TaskStatus, TicketPriority } from "@/types/database";

const STATUSES: TaskStatus[] = ["todo", "in_progress", "done", "cancelled"];
const PRIORITIES: TicketPriority[] = ["low", "normal", "high", "urgent"];
const PRIORITY_COLOR: Record<TicketPriority, string> = {
  low: "var(--text-faint)",
  normal: "var(--blue)",
  high: "var(--warning)",
  urgent: "var(--error)",
};

function CreateTaskForm({ staff, onDone }: { staff: Pick<Profile, "id" | "full_name" | "email">[]; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [assignedTo, setAssignedTo] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="card card-pad mb-3" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label className="field-label">Title</label>
      <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Follow up on dispute #4213" />
      <label className="field-label">Description (optional)</label>
      <input className="field" value={description} onChange={(e) => setDescription(e.target.value)} />
      <label className="field-label">Priority</label>
      <div className="row gap-2">
        {PRIORITIES.map((p) => (
          <div key={p} className={`chip tap ${priority === p ? "selected" : ""}`} style={{ textTransform: "capitalize" }} onClick={() => setPriority(p)}>
            {p}
          </div>
        ))}
      </div>
      <label className="field-label">Assign to</label>
      <select className="field" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
        <option value="">Unassigned</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.full_name || s.email}
          </option>
        ))}
      </select>
      {error && (
        <div className="muted" style={{ color: "var(--error)" }}>
          {error}
        </div>
      )}
      <button
        className="btn btn-primary btn-block"
        disabled={!title.trim() || pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              await createTask({ title, description, priority, assignedTo: assignedTo || null });
              onDone();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not create task.");
            }
          });
        }}
      >
        {pending ? "Creating…" : "Create task"}
      </button>
    </div>
  );
}

function TaskRow({ task, staff }: { task: AdminTaskWithNames; staff: Pick<Profile, "id" | "full_name" | "email">[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/super-admin") ? "/super-admin" : "/admin";
  const [pending, startTransition] = useTransition();

  return (
    <div className="card card-pad mb-2" style={{ opacity: task.status === "done" || task.status === "cancelled" ? 0.6 : 1 }}>
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>{task.title}</div>
          {task.description && <div className="muted mt-1">{task.description}</div>}
          {task.related_table && (
            <a href={`${basePath}/${task.related_table}/${task.related_id}`} style={{ fontSize: 11.5, color: "var(--green)", fontWeight: 700 }}>
              View {task.related_table.replace(/s$/, "")}
            </a>
          )}
        </div>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: PRIORITY_COLOR[task.priority], textTransform: "uppercase", flexShrink: 0 }}>{task.priority}</span>
      </div>
      <div className="row gap-2 mt-2" style={{ flexWrap: "wrap", opacity: pending ? 0.6 : 1 }}>
        {STATUSES.map((s) => (
          <div
            key={s}
            className={`chip tap ${task.status === s ? "selected" : ""}`}
            style={{ padding: "5px 10px", fontSize: 11.5, textTransform: "capitalize" }}
            onClick={() => startTransition(async () => { await setTaskStatus(task.id, s); router.refresh(); })}
          >
            {s.replace("_", " ")}
          </div>
        ))}
      </div>
      <select
        className="field mt-2"
        style={{ fontSize: 12, height: 34 }}
        value={task.assigned_to ?? ""}
        onChange={(e) => startTransition(async () => { await reassignTask(task.id, e.target.value || null); router.refresh(); })}
      >
        <option value="">Unassigned</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.full_name || s.email}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TasksClient({ tasks, staff }: { tasks: AdminTaskWithNames[]; staff: Pick<Profile, "id" | "full_name" | "email">[] }) {
  const [creating, setCreating] = useState(false);
  const router = useRouter();

  return (
    <div>
      <button className="btn btn-primary mb-3" style={{ height: 38, padding: "0 16px" }} onClick={() => setCreating((v) => !v)}>
        <Icon name={creating ? "x" : "plus"} size={14} stroke={2.4} /> {creating ? "Close" : "New task"}
      </button>
      {creating && <CreateTaskForm staff={staff} onDone={() => { setCreating(false); router.refresh(); }} />}
      {tasks.length === 0 ? (
        <div className="card card-pad muted">No tasks.</div>
      ) : (
        tasks.map((t) => <TaskRow key={t.id} task={t} staff={staff} />)
      )}
    </div>
  );
}
