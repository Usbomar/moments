-- Música de fons per a presentacions de col·leccions.

create table if not exists public.collection_music_tracks (
  id text primary key,
  user_id text not null,
  title text not null,
  source text not null check (source in ('uploaded', 'linked')),
  url text not null,
  storage_path text,
  duration_seconds int,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

alter table public.albums
  add column if not exists music_track_id text references public.collection_music_tracks(id) on delete set null;

create index if not exists idx_collection_music_tracks_user_created
  on public.collection_music_tracks(user_id, created_at desc);

insert into storage.buckets (id, name, public)
values ('collection-music', 'collection-music', true)
on conflict (id) do nothing;

alter table public.collection_music_tracks enable row level security;

drop policy if exists "collection_music_tracks_crud_own" on public.collection_music_tracks;
create policy "collection_music_tracks_crud_own"
on public.collection_music_tracks
for all
to authenticated
using (user_id = auth.uid()::text)
with check (user_id = auth.uid()::text);
