/**
 * Hand-rolled 24x24 line-icon set, ported 1:1 from the TopMe design prototype.
 * Brand-specific (droplet, zap, satellite, simcard, etc.) — not swapped for a
 * generic icon package so the catalog keeps its original visual identity.
 */
const ICO: Record<string, string> = {
  home: `<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9"/>`,
  grid: `<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>`,
  wallet: `<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18"/><circle cx="16.5" cy="14.2" r="1.2" fill="currentColor" stroke="none"/>`,
  clock: `<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>`,
  user: `<circle cx="12" cy="8.2" r="3.6"/><path d="M4.5 20c1.3-4 4.2-6 7.5-6s6.2 2 7.5 6"/>`,
  search: `<circle cx="10.8" cy="10.8" r="6.3"/><path d="M20 20l-4.6-4.6"/>`,
  bell: `<path d="M6 10a6 6 0 1 1 12 0c0 4 1.4 5.2 1.4 5.2H4.6S6 14 6 10Z"/><path d="M10 18.5a2 2 0 0 0 4 0"/>`,
  chevronR: `<path d="M9 5l7 7-7 7"/>`,
  chevronL: `<path d="M15 5l-7 7 7 7"/>`,
  chevronD: `<path d="M5 9l7 7 7-7"/>`,
  star: `<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.8Z"/>`,
  starFill: `<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.8Z" fill="currentColor"/>`,
  check: `<path d="M5 12.5l4.5 4.5L19 7"/>`,
  x: `<path d="M6 6l12 12M18 6L6 18"/>`,
  menu: `<path d="M4 6.5h16M4 12h16M4 17.5h16"/>`,
  share: `<circle cx="18" cy="5.5" r="2.3"/><circle cx="6" cy="12" r="2.3"/><circle cx="18" cy="18.5" r="2.3"/><path d="M8.1 10.8 15.9 6.7M8.1 13.2l7.8 4.1"/>`,
  download: `<path d="M12 3.5v11"/><path d="M7.5 10.5 12 15l4.5-4.5"/><path d="M4.5 18.5h15"/>`,
  printer: `<rect x="5" y="8.5" width="14" height="7" rx="1.5"/><path d="M7 8.5V4.5h10v4"/><path d="M7 15.5v4h10v-4"/>`,
  copy: `<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M5.5 15.5h-1a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>`,
  mail: `<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="M4.5 7l7.5 6 7.5-6"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  minus: `<path d="M5 12h14"/>`,
  alert: `<path d="M12 4 21 19H3Z"/><path d="M12 10v4"/><circle cx="12" cy="16.7" r="0.9" fill="currentColor" stroke="none"/>`,
  refresh: `<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5"/><path d="M20 4v4.5h-4.5"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5"/><path d="M4 20v-4.5h4.5"/>`,
  headset: `<path d="M4 13v-1a8 8 0 0 1 16 0v1"/><rect x="3" y="13" width="4.2" height="6" rx="1.8"/><rect x="16.8" y="13" width="4.2" height="6" rx="1.8"/><path d="M20 19v.5a3 3 0 0 1-3 3h-3.5"/>`,
  arrowUpR: `<path d="M7 17 17 7"/><path d="M9 7h8v8"/>`,
  arrowDnL: `<path d="M17 7 7 17"/><path d="M15 17H7V9"/>`,
  droplet: `<path d="M12 3.5s6.5 7 6.5 11.3a6.5 6.5 0 0 1-13 0C5.5 10.5 12 3.5 12 3.5Z"/>`,
  phone: `<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.3h3"/>`,
  gift: `<rect x="3.5" y="9" width="17" height="4" rx="1"/><rect x="4.5" y="13" width="15" height="8" rx="1.5"/><path d="M12 9v12"/><path d="M12 9c-1-3-3-4.5-4.5-3.5C6 6.5 7.2 9 12 9Zm0 0c1-3 3-4.5 4.5-3.5C18 6.5 16.8 9 12 9Z"/>`,
  packet: `<rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="M4 9.5h16"/><circle cx="12" cy="14" r="2.6"/>`,
  scan: `<path d="M4 8V6a2 2 0 0 1 2-2h2"/><path d="M16 4h2a2 2 0 0 1 2 2v2"/><path d="M20 16v2a2 2 0 0 1-2 2h-2"/><path d="M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M4 12h16"/>`,
  edit: `<path d="M4 20.5h4L18.5 10 14 5.5 3.5 16v4Z"/><path d="M12.5 7 17 11.5"/>`,
  chat: `<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8A2.5 2.5 0 0 1 17.5 16H10l-4.5 4.5V16h-1A2.5 2.5 0 0 1 2 13.5"/>`,
  image: `<rect x="3" y="4.5" width="18" height="15" rx="2"/><circle cx="8.5" cy="9.5" r="1.7"/><path d="M3 16.5 8.5 12l4 3.5 3-2.5 5.5 4.5"/>`,
  lock: `<rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>`,
  qr: `<rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="3" height="3"/><rect x="18" y="18" width="3" height="3"/><rect x="14" y="18" width="3" height="3"/><rect x="18" y="14" width="3" height="3"/>`,
  tv: `<rect x="3" y="5" width="18" height="12.5" rx="2"/><path d="M8.5 21h7"/>`,
  wifi: `<path d="M3.5 9a13 13 0 0 1 17 0"/><path d="M6.5 12.7a9 9 0 0 1 11 0"/><path d="M9.7 16.3a4.6 4.6 0 0 1 4.6 0"/><circle cx="12" cy="19.2" r="1" fill="currentColor" stroke="none"/>`,
  book: `<path d="M4 5.5A2 2 0 0 1 6 4h5v16H6a2 2 0 0 0-2 2Z"/><path d="M20 5.5A2 2 0 0 0 18 4h-5v16h5a2 2 0 0 1 2 2Z"/>`,
  shield: `<path d="M12 3.5 19 6.5v5c0 5-3 8.2-7 9.9-4-1.7-7-4.9-7-9.9v-5Z"/>`,
  send: `<path d="M4 12 20.5 4 13 20.5 10.5 13 4 12Z"/>`,
  bag: `<rect x="4" y="8" width="16" height="12.5" rx="2.5"/><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8"/>`,
  filter: `<path d="M4 5.5h16l-6.2 7.4v6l-3.6 1.8v-7.8Z"/>`,
  settings: `<circle cx="12" cy="12" r="3"/><path d="M19.4 12a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7.5 7.5 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.5 7.5 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z"/>`,
  logout: `<path d="M9 4.5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h3"/><path d="M15.5 16.5 20 12l-4.5-4.5"/><path d="M20 12H9"/>`,
  users: `<circle cx="9" cy="8.5" r="3.2"/><path d="M2.8 19.5c.9-3.4 3.3-5.2 6.2-5.2s5.3 1.8 6.2 5.2"/><circle cx="17.5" cy="8" r="2.6"/><path d="M15.8 14.5c2.3.3 4 1.9 4.7 5"/>`,
  smartphone: `<rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M11 18.3h2"/>`,
  building: `<rect x="4" y="3" width="10" height="18"/><rect x="14" y="9" width="6" height="12"/><path d="M7 6.5h1M10.5 6.5h1M7 10h1M10.5 10h1M7 13.5h1M10.5 13.5h1M16.5 12.5h1M16.5 16h1"/>`,
  ticket: `<path d="M3.5 8.5A2 2 0 0 1 5.5 6.5h13A2 2 0 0 1 20.5 8.5v1.7a1.7 1.7 0 0 0 0 3.4v1.7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-1.7a1.7 1.7 0 0 0 0-3.4Z"/><path d="M9 6.5v11"/>`,
  scale: `<path d="M12 3v18M6 7h12M6 7l-3 6.5a3 3 0 0 0 6 0Zm12 0-3 6.5a3 3 0 0 0 6 0Z"/>`,
  car: `<path d="M4 16V11l1.8-4.2A2 2 0 0 1 7.6 5.5h8.8a2 2 0 0 1 1.8 1.3L20 11v5"/><rect x="3" y="15.7" width="18" height="3.5" rx="1.5"/><circle cx="7.5" cy="19.5" r="1.4"/><circle cx="16.5" cy="19.5" r="1.4"/>`,
  fuel: `<path d="M5 20.5V6a1.5 1.5 0 0 1 1.5-1.5h6A1.5 1.5 0 0 1 14 6v14.5"/><path d="M4 20.5h11"/><path d="M14 10.5h2.2L19 13v5a1.5 1.5 0 0 1-3 0"/><path d="M14 6.5 16.3 4"/>`,
  heart: `<path d="M12 20s-7.5-4.6-9.6-9A5.4 5.4 0 0 1 12 6a5.4 5.4 0 0 1 9.6 5c-2.1 4.4-9.6 9-9.6 9Z"/>`,
  zap: `<path d="M13 2.5 4.5 14h6l-1 7.5L19 10h-6Z"/>`,
  play: `<circle cx="12" cy="12" r="9"/><path d="M10 8.3 16.2 12 10 15.7Z" fill="currentColor" stroke="none"/>`,
  music: `<circle cx="6.5" cy="17.5" r="2.3"/><circle cx="17" cy="15.5" r="2.3"/><path d="M8.8 17.5V5.5L19.3 3v12"/>`,
  moon: `<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>`,
  sun: `<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>`,
  battery: `<rect x="3" y="8" width="16" height="8" rx="2"/><path d="M21 11v2"/><path d="M7 9.5v5M11 9.5v5"/>`,
  plug: `<path d="M9 3v5M15 3v5"/><path d="M6 8h12v4a6 6 0 0 1-12 0Z"/><path d="M12 18v3"/>`,
  leaf: `<path d="M20 4C10 4 4 10 4 20c10 0 16-6 16-16Z"/><path d="M6 18 18 6"/>`,
  satellite: `<path d="M4 14 10 20"/><path d="M9 9 15 15"/><circle cx="6.5" cy="17.5" r="2"/><path d="M13 4c4 0 7 3 7 7"/><path d="M13 8c2 0 3 1 3 3"/>`,
  simcard: `<path d="M7 3h7l4 4v14H7Z"/><path d="M10 9h4v6h-4z"/>`,
  router: `<rect x="3" y="10" width="18" height="7" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="7.5" cy="13.5" r="0.8" fill="currentColor" stroke="none"/><circle cx="11" cy="13.5" r="0.8" fill="currentColor" stroke="none"/>`,
  cable: `<path d="M6 4v6a4 4 0 0 0 4 4h4a4 4 0 0 1 4 4v6"/><circle cx="6" cy="3" r="1.6"/><circle cx="18" cy="21" r="1.6"/>`,
  laptop: `<rect x="4" y="5" width="16" height="10" rx="1.5"/><path d="M2 19h20l-2-3H4Z"/>`,
  monitor: `<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16v4"/>`,
  headphones: `<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.8"/><rect x="17" y="14" width="4" height="6" rx="1.8"/>`,
};

export type IconName = keyof typeof ICO;

export function Icon({
  name,
  size = 20,
  stroke = 2,
  className,
}: {
  name: string;
  size?: number;
  stroke?: number;
  className?: string;
}) {
  const paths = ICO[name] || "";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      dangerouslySetInnerHTML={{ __html: paths }}
    />
  );
}
