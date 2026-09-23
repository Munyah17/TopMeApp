import type { CSSProperties } from "react";

/**
 * Font Awesome glyph map — the CoolAdmin reskin swaps the hand-rolled line
 * icons for FA 7 (subset built by scripts/build-fa-subset.py from /vendor/fontawesome). `Icon` keeps
 * the same API (name/size/className) so no call sites change.
 * `c` = FA class list, `r` = optional rotation in degrees (fa-rotate-by).
 */
const ICO: Record<string, { c: string; r?: number }> = {
  home: { c: "fa-solid fa-house" },
  grid: { c: "fa-solid fa-table-cells-large" },
  wallet: { c: "fa-solid fa-wallet" },
  clock: { c: "fa-regular fa-clock" },
  user: { c: "fa-solid fa-user" },
  search: { c: "fa-solid fa-magnifying-glass" },
  bell: { c: "fa-solid fa-bell" },
  chevronR: { c: "fa-solid fa-chevron-right" },
  chevronL: { c: "fa-solid fa-chevron-left" },
  chevronD: { c: "fa-solid fa-chevron-down" },
  star: { c: "fa-regular fa-star" },
  starFill: { c: "fa-solid fa-star" },
  check: { c: "fa-solid fa-check" },
  x: { c: "fa-solid fa-xmark" },
  menu: { c: "fa-solid fa-bars" },
  share: { c: "fa-solid fa-share-nodes" },
  download: { c: "fa-solid fa-download" },
  printer: { c: "fa-solid fa-print" },
  copy: { c: "fa-regular fa-copy" },
  mail: { c: "fa-regular fa-envelope" },
  plus: { c: "fa-solid fa-plus" },
  minus: { c: "fa-solid fa-minus" },
  alert: { c: "fa-solid fa-triangle-exclamation" },
  refresh: { c: "fa-solid fa-rotate" },
  headset: { c: "fa-solid fa-headset" },
  arrowUpR: { c: "fa-solid fa-arrow-up fa-rotate-by", r: 45 },
  arrowDnL: { c: "fa-solid fa-arrow-down fa-rotate-by", r: 45 },
  droplet: { c: "fa-solid fa-droplet" },
  phone: { c: "fa-solid fa-mobile-screen" },
  gift: { c: "fa-solid fa-gift" },
  packet: { c: "fa-solid fa-box" },
  scan: { c: "fa-solid fa-expand" },
  edit: { c: "fa-solid fa-pen" },
  chat: { c: "fa-regular fa-comment" },
  image: { c: "fa-regular fa-image" },
  lock: { c: "fa-solid fa-lock" },
  qr: { c: "fa-solid fa-qrcode" },
  tv: { c: "fa-solid fa-tv" },
  wifi: { c: "fa-solid fa-wifi" },
  book: { c: "fa-solid fa-book-open" },
  shield: { c: "fa-solid fa-shield-halved" },
  send: { c: "fa-solid fa-paper-plane" },
  bag: { c: "fa-solid fa-bag-shopping" },
  filter: { c: "fa-solid fa-filter" },
  settings: { c: "fa-solid fa-gear" },
  logout: { c: "fa-solid fa-right-from-bracket" },
  users: { c: "fa-solid fa-users" },
  smartphone: { c: "fa-solid fa-mobile-screen-button" },
  building: { c: "fa-regular fa-building" },
  ticket: { c: "fa-solid fa-ticket" },
  scale: { c: "fa-solid fa-scale-balanced" },
  car: { c: "fa-solid fa-car" },
  fuel: { c: "fa-solid fa-gas-pump" },
  heart: { c: "fa-solid fa-heart" },
  zap: { c: "fa-solid fa-bolt" },
  play: { c: "fa-regular fa-circle-play" },
  music: { c: "fa-solid fa-music" },
  moon: { c: "fa-solid fa-moon" },
  sun: { c: "fa-solid fa-sun" },
  battery: { c: "fa-solid fa-battery-three-quarters" },
  plug: { c: "fa-solid fa-plug" },
  leaf: { c: "fa-solid fa-leaf" },
  satellite: { c: "fa-solid fa-satellite-dish" },
  simcard: { c: "fa-solid fa-sim-card" },
  router: { c: "fa-solid fa-tower-broadcast" },
  cable: { c: "fa-solid fa-ethernet" },
  laptop: { c: "fa-solid fa-laptop" },
  monitor: { c: "fa-solid fa-desktop" },
  headphones: { c: "fa-solid fa-headphones" },
};

export type IconName = keyof typeof ICO;

export function Icon({
  name,
  size = 20,
  className,
}: {
  name: string;
  size?: number;
  /** @deprecated FA glyphs are fill-based — kept in the type so existing call sites compile. */
  stroke?: number;
  className?: string;
}) {
  const ico = ICO[name];
  const style = {
    fontSize: size,
    ...(ico?.r ? { "--fa-rotate-angle": `${ico.r}deg` } : {}),
  } as CSSProperties;
  return (
    <i
      className={`tm-ico ${ico?.c ?? "fa-solid fa-circle-question"}${className ? ` ${className}` : ""}`}
      style={style}
      aria-hidden="true"
    />
  );
}
