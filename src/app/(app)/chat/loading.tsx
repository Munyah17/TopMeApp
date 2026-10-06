export default function ChatLoading() {
  return (
    <div className="px content-wrap" style={{ paddingTop: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 360, textAlign: "center" }}>
        <div className="spinner-ring" />
        <div style={{ fontWeight: 700, marginTop: 20 }}>Loading Chat &amp; Pay…</div>
        <div className="muted mt-1">Getting your conversations ready</div>
      </div>
    </div>
  );
}
