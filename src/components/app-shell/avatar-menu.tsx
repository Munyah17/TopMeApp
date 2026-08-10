"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { signOut } from "@/lib/actions/account";

const ITEMS = [
  { href: "/account", label: "My Profile", icon: "user" },
  { href: "/account", label: "Settings", icon: "settings" },
  { href: "/account#notifications", label: "Notifications", icon: "bell" },
] as const;

export function AvatarMenu({ initials }: { initials: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" className="header-avatar tap" onClick={() => setOpen((v) => !v)} aria-label="Account menu">
        {initials}
      </button>
      {open && (
        <div className="avatar-menu">
          {ITEMS.map((item) => (
            <Link key={item.label} href={item.href} className="avatar-menu-item" onClick={() => setOpen(false)}>
              <Icon name={item.icon} size={16} stroke={1.9} />
              <span>{item.label}</span>
            </Link>
          ))}
          <button
            type="button"
            className="avatar-menu-item avatar-menu-logout"
            onClick={async () => {
              setOpen(false);
              await signOut();
              router.push("/login");
              router.refresh();
            }}
          >
            <Icon name="logout" size={16} stroke={1.9} />
            <span>Log Out</span>
          </button>
        </div>
      )}
    </div>
  );
}
