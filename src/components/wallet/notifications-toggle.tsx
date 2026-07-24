"use client";

import { useState, useTransition } from "react";
import { setNotificationsEnabled } from "@/lib/actions/account";

export function NotificationsToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [, startTransition] = useTransition();
  return (
    <div
      className={`toggle ${on ? "on" : ""} tap`}
      role="switch"
      aria-checked={on}
      onClick={() => {
        const next = !on;
        setOn(next);
        startTransition(() => setNotificationsEnabled(next));
      }}
    >
      <div className="knob" />
    </div>
  );
}
