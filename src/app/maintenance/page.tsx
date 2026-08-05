import { BrandMark, Wordmark } from "@/components/logo";

export default function MaintenancePage() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 24,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
        <BrandMark size={34} />
        <Wordmark size={18} />
      </div>
      <h1 style={{ fontSize: 20, fontWeight: 800 }}>We&apos;ll be right back</h1>
      <div className="muted mt-1" style={{ maxWidth: 300 }}>
        TopMe is briefly down for maintenance. Please check back in a few minutes.
      </div>
    </div>
  );
}
