export function Footer() {
  return (
    <footer style={{ padding: "32px 22px", textAlign: "center", borderTop: "1px solid var(--border)", marginTop: 24 }}>
      <div className="muted" style={{ fontSize: 12.5 }}>
        © {new Date().getFullYear()} TopMe. Top up. Pay easy.
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
        <a
          href="https://globalspaceweb.co.zw"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "inherit", textDecoration: "none" }}
        >
          Developed &amp; Powered By Global Space Web · +263773909307
        </a>
      </div>
    </footer>
  );
}
