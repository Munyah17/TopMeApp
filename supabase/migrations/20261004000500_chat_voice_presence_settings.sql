-- Chat & Pay expansion: voice notes, presence/last-seen, and the profile
-- columns that back chat privacy settings.

-- Voice messages ride the same messages row shape as images: kind +
-- dedicated URL + duration metadata.
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('text', 'image', 'voice', 'p2p_transfer'));
alter table public.messages add column if not exists voice_url text;
alter table public.messages add column if not exists voice_duration_ms integer;

-- Presence + privacy. last_seen_at is written by the client's heartbeat/
-- presence-leave hooks; show_last_seen=false hides both fields from the
-- counterpart (WhatsApp parity: hide yours, see no one's... we keep the
-- simpler version — hiding yours only).
alter table public.profiles add column if not exists last_seen_at timestamptz;
alter table public.profiles add column if not exists show_last_seen boolean not null default true;

-- Voice note storage. Same pattern as chat-images: public URLs behind
-- message-row RLS (the URL only ever surfaces inside a message the
-- participant can already read), randomized paths, authenticated writes.
insert into storage.buckets (id, name, public)
values ('chat-voice', 'chat-voice', true)
on conflict (id) do nothing;

drop policy if exists chat_voice_public_read on storage.objects;
create policy chat_voice_public_read on storage.objects
  for select using (bucket_id = 'chat-voice');

drop policy if exists chat_voice_authenticated_write on storage.objects;
create policy chat_voice_authenticated_write on storage.objects
  for insert with check (bucket_id = 'chat-voice' and auth.role() = 'authenticated');
