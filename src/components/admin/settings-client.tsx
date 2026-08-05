"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSetting } from "@/lib/actions/settings";

interface SettingRow {
  key: string;
  value: unknown;
  description: string | null;
}

function SettingField({ setting }: { setting: SettingRow }) {
  const router = useRouter();
  const isBoolean = typeof setting.value === "boolean";
  const isObject = typeof setting.value === "object" && setting.value !== null;
  const [text, setText] = useState(isObject ? JSON.stringify(setting.value) : String(setting.value));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save(next: unknown) {
    setError(null);
    startTransition(async () => {
      try {
        await updateSetting(setting.key, next);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save.");
      }
    });
  }

  return (
    <div className="card card-pad mb-2">
      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{setting.key}</div>
      {setting.description && <div className="muted mt-1" style={{ fontSize: 12 }}>{setting.description}</div>}

      {isBoolean ? (
        <div
          className={`toggle mt-2 ${setting.value ? "on" : ""} tap`}
          onClick={() => !pending && save(!setting.value)}
        >
          <div className="knob" />
        </div>
      ) : (
        <div className="row gap-2 mt-2">
          <input className="field" style={{ flex: 1 }} value={text} onChange={(e) => setText(e.target.value)} />
          <button
            className="btn btn-secondary"
            disabled={pending}
            onClick={() => {
              try {
                save(isObject ? JSON.parse(text) : isNaN(Number(text)) ? text : Number(text));
              } catch {
                setError("Invalid value.");
              }
            }}
          >
            Save
          </button>
        </div>
      )}
      {error && (
        <div className="muted mt-2" style={{ color: "var(--error)" }}>
          {error}
        </div>
      )}
    </div>
  );
}

export function SettingsClient({ settings }: { settings: SettingRow[] }) {
  return (
    <div>
      {settings.map((s) => (
        <SettingField key={s.key} setting={s} />
      ))}
    </div>
  );
}
