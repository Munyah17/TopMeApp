import { notFound } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { SupportThread } from "@/components/admin/support-thread";
import { getSupportTicket, getSupportTicketMessages } from "@/lib/data/support-queries";
import { getStaffProfiles } from "@/lib/data/task-queries";
import { getMyPermissions } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/data/queries";

export async function SupportDetailBody({ id, basePath }: { id: string; basePath: string }) {
  const [permissions, user] = await Promise.all([getMyPermissions(), getCurrentUser()]);
  if (!permissions.includes("support.manage")) {
    return <div className="muted">You don&apos;t have permission to view support tickets.</div>;
  }
  if (!user) return null;

  const [ticket, messages, staff] = await Promise.all([getSupportTicket(id), getSupportTicketMessages(id), getStaffProfiles()]);
  if (!ticket) notFound();

  return (
    <div>
      <Link href={`${basePath}/support`} className="row gap-2" style={{ textDecoration: "none", color: "var(--text-soft)", marginBottom: 12, fontSize: 13, fontWeight: 700 }}>
        <Icon name="chevronL" size={15} stroke={2.2} /> Back to Support
      </Link>
      <SupportThread ticket={ticket} messages={messages} currentUserId={user.id} staff={staff} />
    </div>
  );
}
