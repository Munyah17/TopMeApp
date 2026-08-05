import { notFound } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { DisputeThread } from "@/components/admin/dispute-thread";
import { getDispute, getDisputeMessages } from "@/lib/data/dispute-queries";
import { getMyPermissions } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/data/queries";

export default async function DisputeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [permissions, user] = await Promise.all([getMyPermissions(), getCurrentUser()]);
  if (!permissions.includes("disputes.manage")) {
    return <div className="muted">You don&apos;t have permission to view disputes.</div>;
  }
  if (!user) return null;

  const [dispute, messages] = await Promise.all([getDispute(id), getDisputeMessages(id)]);
  if (!dispute) notFound();

  return (
    <div>
      <Link href="/admin/disputes" className="row gap-2" style={{ textDecoration: "none", color: "var(--text-soft)", marginBottom: 12, fontSize: 13, fontWeight: 700 }}>
        <Icon name="chevronL" size={15} stroke={2.2} /> Back to Disputes
      </Link>
      <DisputeThread dispute={dispute} messages={messages} currentUserId={user.id} />
    </div>
  );
}
