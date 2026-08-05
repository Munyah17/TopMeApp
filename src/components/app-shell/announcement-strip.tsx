import { getActiveAnnouncements } from "@/lib/data/queries";

export async function AnnouncementStrip({ audience }: { audience: "customers" | "staff" }) {
  const announcements = await getActiveAnnouncements(audience);
  if (announcements.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
      {announcements.map((a) => (
        <div
          key={a.id}
          className="card card-pad"
          style={{ background: "var(--blue-50)", borderColor: "var(--blue)", display: "flex", flexDirection: "column", gap: 2 }}
        >
          <div style={{ fontWeight: 700, fontSize: 13 }}>{a.title}</div>
          <div className="muted" style={{ fontSize: 12 }}>{a.body}</div>
        </div>
      ))}
    </div>
  );
}
