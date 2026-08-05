import { notFound } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { SupportThread } from "@/components/admin/support-thread";
import { getSupportTicket, getSupportTicketMessages } from "@/lib/data/support-queries";
import { getMyPermissions } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/data/queries";

export default async function SupportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [permissions, user] = await Promise.all([getMyPermissions(), getCurrentUser()]);
  if (!permissions.includes("support.manage")) {
    return <div className="muted">You don&apos;t have permission to view support tickets.</div>;
  }
  if (!user) return null;

  const [ticket, messages] = await Promise.all([getSupportTicket(id), getSupportTicketMessages(id)]);
  if (!ticket) notFound();

  return (
    <div>
      <Link href="/admin/support" className="row gap-2" style={{ textDecoration: "none", color: "var(--text-soft)", marginBottom: 12, fontSize: 13, fontWeight: 700 }}>
        <Icon name="chevronL" size={15} stroke={2.2} /> Back to Support
      </Link>
      <SupportThread ticket={ticket} messages={messages} currentUserId={user.id} />
    </div>
  );
}
