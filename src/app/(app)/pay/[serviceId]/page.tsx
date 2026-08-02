import { notFound } from "next/navigation";
import { AirtimeFlow } from "@/components/payment-flow/airtime-flow";
import { BroadbandFlow } from "@/components/payment-flow/broadband-flow";
import { CouncilFlow } from "@/components/payment-flow/council-flow";
import { PaymentFlow } from "@/components/payment-flow/payment-flow";
import { ZesaFlow } from "@/components/payment-flow/zesa-flow";
import { getCurrentProfile, getDataBundles, getNetworks, getService, getTvPackages, getWallet } from "@/lib/data/queries";

// Services with a bespoke, hand-built flow (see the reference UX brief) —
// each service family gets its own step sequence rather than one generic
// wizard, since airtime/ZESA/etc. genuinely need different steps. Anything
// not listed here falls through to the generic PaymentFlow below.
const AIRTIME_FLOW_SERVICES = new Set(["airtime", "airtimevouchers"]);
// Account-number ISP/broadband bills — same account-lookup shape, only the
// amount step differs (TelOne: pick a package; ZOL/others: full balance or
// custom amount), branched inside BroadbandFlow itself.
const BROADBAND_FLOW_SERVICES = new Set(["telone", "zol", "starlink", "utande", "africom"]);

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

  const isGuest = !profile;
  const walletBalance = wallet?.balance ?? 0;
  const guestEmail = profile?.email ?? "";
  const guestPhone = profile?.phone ?? "";

  if (AIRTIME_FLOW_SERVICES.has(service.id)) {
    return <AirtimeFlow service={service} networks={networks} walletBalance={walletBalance} isGuest={isGuest} guestEmail={guestEmail} guestPhone={guestPhone} />;
  }

  if (service.id === "zesa") {
    return <ZesaFlow service={service} walletBalance={walletBalance} isGuest={isGuest} guestEmail={guestEmail} guestPhone={guestPhone} />;
  }

  // All 26 councils/municipalities/town councils share the same "account
  // number -> owner lookup -> arbitrary payment amount" shape (confirmed
  // against the Bulawayo reference flow), regardless of whether VitalPay
  // actually fulfils this specific one or it falls back to simulated.
  if (service.category_id === "government") {
    return <CouncilFlow service={service} walletBalance={walletBalance} isGuest={isGuest} guestEmail={guestEmail} guestPhone={guestPhone} />;
  }

  if (BROADBAND_FLOW_SERVICES.has(service.id)) {
    return <BroadbandFlow service={service} walletBalance={walletBalance} isGuest={isGuest} guestEmail={guestEmail} guestPhone={guestPhone} />;
  }

  return (
    <PaymentFlow
      service={service}
      bundles={bundles}
      packages={packages}
      networks={networks}
      walletBalance={walletBalance}
      isGuest={isGuest}
      guestEmail={guestEmail}
      guestPhone={guestPhone}
    />
  );
}
