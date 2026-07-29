import { notFound } from "next/navigation";
import { PaymentFlow } from "@/components/payment-flow/payment-flow";
import { getCurrentProfile, getDataBundles, getNetworks, getService, getTvPackages, getWallet } from "@/lib/data/queries";

export default async function PayPage({ params }: { params: Promise<{ serviceId: string }> }) {
  const { serviceId } = await params;
  const [service, profile] = await Promise.all([getService(serviceId), getCurrentProfile()]);
  if (!service) notFound();

  const [bundles, packages, networks, wallet] = await Promise.all([
    service.amount_mode === "bundles" ? getDataBundles() : Promise.resolve([]),
    service.amount_mode === "packages" ? getTvPackages() : Promise.resolve([]),
    service.needs_network ? getNetworks() : Promise.resolve([]),
    profile ? getWallet(profile.id) : Promise.resolve(null),
  ]);

  return (
    <PaymentFlow
      service={service}
      bundles={bundles}
      packages={packages}
      networks={networks}
      walletBalance={wallet?.balance ?? 0}
      isGuest={!profile}
      guestEmail={profile?.email ?? ""}
      guestPhone={profile?.phone ?? ""}
    />
  );
}
