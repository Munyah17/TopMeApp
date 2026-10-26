"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateNotificationRecipients } from "@/lib/actions/settings";

// Editor for app_settings.notification_recipients — where the ops alerts
// (new/failed registrations, top-ups, failed transactions) get sent. Three
// line-per-recipient textareas; one Update button. The generic
// SettingsClient row for this key is filtered out on the page so this is
// the single edit path.
export function NotificationRecipientsClient({ emails, sms, whatsapp }: { emails: string[]; sms: string[]; whatsapp: string[] }) {
  const router = useRouter();
  const [emailsText, setEmailsText] = useState(emails.join("\n"));
  const [smsText, setSmsText] = useState(sms.join("\n"));
  const [whatsappText, setWhatsappText] = useState(whatsapp.join("\n"));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const lines = (s: string) => s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await updateNotificationRecipients({ emails: lines(emailsText), sms: lines(smsText), whatsapp: lines(whatsappText) });
        setSaved(true);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save.");
      }
    });
  }

  const box = (label: string, value: string, set: (v: string) => void, placeholder: string, hint: string) => (
    <div style={{ minWidth: 180, flex: 1 }}>
      <label className="field-label">{label}</label>
      <textarea
        className="field"
        rows={4}
        style={{ resize: "vertical", lineHeight: 1.5 }}
        value={value}
        onChange={(e) => set(e.target.value)}
        placeholder={placeholder}
      />
      <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{hint}</div>
    </div>
  );

  return (
    <div className="card card-pad mb-2">
      <div style={{ fontWeight: 700, fontSize: 13.5 }}>Notification recipients</div>
      <div className="muted mt-1" style={{ fontSize: 12 }}>
        Who gets the ops alerts — new and failed registrations, every wallet top-up, and every failed transaction.
        One entry per line. Changes apply immediately after Update.
      </div>
      <div className="row gap-2 mt-2" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
        {box("Email addresses", emailsText, setEmailsText, "notifications@topme.co.zw", "Get the full HTML alert — amount, reference, customer, reason.")}
        {box("SMS numbers", smsText, setSmsText, "0771234567 or +263771234567", "Get the one-line alert via txt.co.zw (needs SMS account configured).")}
        {box("WhatsApp numbers", whatsappText, setWhatsappText, "+263771234567", "Saved now — sends once a WhatsApp provider is connected.")}
      </div>
      <div className="row mt-2" style={{ alignItems: "center", gap: 12 }}>
        <button className="btn btn-secondary" disabled={pending || !lines(emailsText).length} onClick={save}>
          {pending ? "Saving…" : "Update"}
        </button>
        {error && <div className="muted" style={{ color: "var(--error)" }}>{error}</div>}
        {saved && !error && <div className="muted" style={{ color: "var(--success)" }}>Saved — alerts now go to the updated lists.</div>}
      </div>
    </div>
  );
}
