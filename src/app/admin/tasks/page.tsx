import Link from "next/link";
import { TasksClient } from "@/components/admin/tasks-client";
import { getStaffProfiles, getTasks } from "@/lib/data/task-queries";
import { getMyPermissions } from "@/lib/auth/permissions";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const [params, permissions] = await Promise.all([searchParams, getMyPermissions()]);
  if (!permissions.includes("tasks.manage")) {
    return <div className="muted">You don&apos;t have permission to view tasks.</div>;
  }

  const [tasks, staff] = await Promise.all([getTasks(params.status), getStaffProfiles()]);

  return (
    <div>
      <h2 style={{ fontSize: 19 }}>Tasks</h2>
      <div className="muted mb-3">Assign follow-ups to yourself or another staff member.</div>

      <div className="row gap-2 mb-3" style={{ flexWrap: "wrap" }}>
        {["", "todo", "in_progress", "done", "cancelled"].map((s) => (
          <Link
            key={s || "all"}
            href={s ? `/admin/tasks?status=${s}` : "/admin/tasks"}
            className={`filter-pill tap ${((params.status ?? "") === s) ? "selected" : ""}`}
            style={{ textDecoration: "none", textTransform: "capitalize" }}
          >
            {(s || "all").replace("_", " ")}
          </Link>
        ))}
      </div>

      <TasksClient tasks={tasks} staff={staff} />
    </div>
  );
}
