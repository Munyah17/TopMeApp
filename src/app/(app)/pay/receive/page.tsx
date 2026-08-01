import Link from "next/link";
import { redirect } from "next/navigation";
import { ReceiveQr } from "@/components/payment-flow/receive-qr";
import { getCurrentProfile } from "@/lib/data/queries";

export default async function ReceivePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  if (!profile.phone) {
    return (
      <div className="px content-narrow" style={{ paddingTop: 40, textAlign: "center" }}>
        <h2 style={{ fontSize: 19 }}>Add your phone number</h2>
        <div className="muted mt-1">We need a phone number on your account before others can send you money.</div>
        <Link href="/account" className="btn btn-primary btn-block mt-4" style={{ textDecoration: "none" }}>
          Go to Account
        </Link>
      </div>
    );
  }

  return <ReceiveQr phone={profile.phone} name={profile.full_name} />;
}
