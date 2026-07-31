export function Footer() {
  return (
    <footer style={{ padding: "32px 22px", textAlign: "center", borderTop: "1px solid var(--border)", marginTop: 24 }}>
      <div className="muted" style={{ fontSize: 12.5 }}>
        © {new Date().getFullYear()} TopMe. Top up. Pay easy.
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
        Developed &amp; Powered By Global Space Web
      </div>
    </footer>
  );
}
