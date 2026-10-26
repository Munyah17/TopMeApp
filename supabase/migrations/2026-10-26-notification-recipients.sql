-- Seed the ops-alert recipient lists, editable in Super Admin -> Settings
-- -> "Notification recipients" (updateNotificationRecipients upserts too,
-- so this just pre-fills the row with the original single-mailbox state).
-- Shape: {"emails": [..], "sms": [..], "whatsapp": [..]} — read by
-- src/lib/data/notification-recipients.ts (getNotificationRecipients):
--   emails    -> HTML alerts via the notifications@ SMTP sender
--   sms       -> one-line alerts via txt.co.zw (needs TXTZW_* creds)
--   whatsapp  -> stored for now; sends when a WhatsApp provider is wired
insert into public.app_settings (key, value, description) values
  ('notification_recipients',
   '{"emails": ["notifications@topme.co.zw"], "sms": [], "whatsapp": []}'::jsonb,
   'Ops alert recipients — emails get HTML alerts; SMS numbers get the short text alerts via txt.co.zw; WhatsApp numbers are stored pending a provider.')
on conflict (key) do nothing;
