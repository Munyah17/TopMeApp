import { redirect } from "next/navigation";
import { SendMoneyFlow } from "@/components/payment-flow/send-money-flow";
import { getCurrentProfile, getMyWallet } from "@/lib/data/queries";

export default async function SendMoneyPage({ searchParams }: { searchParams: Promise<{ to?: string; kind?: string }> }) {
  const [profile, params] = await Promise.all([getCurrentProfile(), searchParams]);
  if (!profile) redirect("/login");

  const wallet = await getMyWallet(profile.id);
  const kind = params.kind === "red_packet" ? "red_packet" : "transfer";

  return <SendMoneyFlow walletBalance={wallet?.balance ?? 0} initialPhone={params.to ?? ""} initialKind={kind} />;
}
