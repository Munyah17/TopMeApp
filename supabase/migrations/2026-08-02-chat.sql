-- 1:1 "Chat & Pay" messaging — a small, focused feature: text messages plus
-- money actions (Send Money / Red Packet) rendered as message cards in the
-- same thread. Money movement itself is unchanged — this only adds the
-- conversation/message layer around the existing wallet_transfer RPC.

-- user_a is always the lower profile id of the pair (enforced by
-- start_conversation below) so a pair can never end up with two rows.
create table if not exists public.conversations (
  id               uuid primary key default gen_random_uuid(),
  user_a           uuid not null references public.profiles(id) on delete cascade,
  user_b           uuid not null references public.profiles(id) on delete cascade,
  last_message     text,
  last_message_at  timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  unique (user_a, user_b)
);
create index if not exists conversations_user_a_idx on public.conversations(user_a, last_message_at desc);
create index if not exists conversations_user_b_idx on public.conversations(user_b, last_message_at desc);

create table if not exists public.messages (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid not null references public.conversations(id) on delete cascade,
  sender_id         uuid not null references public.profiles(id) on delete cascade,
  kind              text not null default 'text' check (kind in ('text', 'image', 'p2p_transfer')),
  body              text,
  image_url         text,
  p2p_transfer_id   uuid references public.p2p_transfers(id),
  created_at        timestamptz not null default now()
);
create index if not exists messages_conversation_idx on public.messages(conversation_id, created_at);

create table if not exists public.conversation_reads (
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  last_read_at     timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- Creates (or returns the existing) conversation for a pair of users, always
-- storing them in canonical (lower id, higher id) order. security definer
-- so it can look up the other user's profile despite profiles' owner-only
-- RLS; race-safe via the unique constraint + on conflict.
create or replace function public.start_conversation(p_other_user_id uuid)
returns public.conversations
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_a uuid;
  v_b uuid;
  v_conv public.conversations;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_other_user_id = v_me then raise exception 'cannot_chat_self'; end if;
  if not exists (select 1 from public.profiles where id = p_other_user_id) then
    raise exception 'recipient_not_found';
  end if;

  if v_me < p_other_user_id then
    v_a := v_me; v_b := p_other_user_id;
  else
    v_a := p_other_user_id; v_b := v_me;
  end if;

  insert into public.conversations (user_a, user_b) values (v_a, v_b)
  on conflict (user_a, user_b) do nothing;

  select * into v_conv from public.conversations where user_a = v_a and user_b = v_b;
  return v_conv;
end;
$$;
revoke all on function public.start_conversation(uuid) from public;
grant execute on function public.start_conversation(uuid) to authenticated;

alter table public.conversations      enable row level security;
alter table public.messages           enable row level security;
alter table public.conversation_reads enable row level security;

-- conversations: participants can read and can bump last_message/last_message_at
-- on their own threads; new rows are only ever created via start_conversation.
drop policy if exists conversations_select_related on public.conversations;
create policy conversations_select_related on public.conversations
  for select using (auth.uid() = user_a or auth.uid() = user_b);

drop policy if exists conversations_update_related on public.conversations;
create policy conversations_update_related on public.conversations
  for update using (auth.uid() = user_a or auth.uid() = user_b)
  with check (auth.uid() = user_a or auth.uid() = user_b);

-- messages: readable/insertable by participants of the parent conversation;
-- senders can only post as themselves.
drop policy if exists messages_select_related on public.messages;
create policy messages_select_related on public.messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

drop policy if exists messages_insert_own on public.messages;
create policy messages_insert_own on public.messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

-- conversation_reads: full CRUD on your own read-marker rows only.
drop policy if exists conversation_reads_all_own on public.conversation_reads;
create policy conversation_reads_all_own on public.conversation_reads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Storage for chat images (screenshots, receipts/POPs, selfies). Public
-- bucket with randomized paths, same simple pattern as product-images —
-- any authenticated user can upload (it's their own message), reads are
-- public-by-URL since the URL itself only ever appears inside a message row
-- already protected by messages_select_related above.
insert into storage.buckets (id, name, public)
values ('chat-images', 'chat-images', true)
on conflict (id) do nothing;

drop policy if exists chat_images_public_read on storage.objects;
create policy chat_images_public_read on storage.objects
  for select using (bucket_id = 'chat-images');

drop policy if exists chat_images_authenticated_write on storage.objects;
create policy chat_images_authenticated_write on storage.objects
  for insert with check (bucket_id = 'chat-images' and auth.role() = 'authenticated');
