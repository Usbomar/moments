-- Fase 1: perfils (rol owner | admin) + RLS per accés amb JWT d’usuari.
-- El backend Next.js continua usant service role (bypass RLS); aquestes polítiques
-- protegeixen accés directe via PostgREST amb anon + sessió d’usuari.
--
-- Dades legacy: si teníeu user_id = 'u-1', després de crear el primer usuari a Auth:
--   update public.assets set user_id = '<uuid>' where user_id = 'u-1';
--   update public.albums set user_id = '<uuid>' where user_id = 'u-1';

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin')),
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'owner')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --- RLS taules d’aplicació ---

alter table public.assets enable row level security;
alter table public.asset_files enable row level security;
alter table public.albums enable row level security;
alter table public.album_assets enable row level security;
alter table public.asset_tags enable row level security;
alter table public.asset_locations enable row level security;
alter table public.locations enable row level security;

-- assets
drop policy if exists "assets_crud_own" on public.assets;
create policy "assets_crud_own" on public.assets for all to authenticated using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

-- asset_files
drop policy if exists "asset_files_via_asset" on public.asset_files;
create policy "asset_files_via_asset" on public.asset_files for all to authenticated using (
  exists (select 1 from public.assets a where a.id = asset_files.asset_id and a.user_id = auth.uid()::text)
) with check (
  exists (select 1 from public.assets a where a.id = asset_files.asset_id and a.user_id = auth.uid()::text)
);

-- albums
drop policy if exists "albums_crud_own" on public.albums;
create policy "albums_crud_own" on public.albums for all to authenticated using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

-- album_assets
drop policy if exists "album_assets_all" on public.album_assets;
create policy "album_assets_all" on public.album_assets for all to authenticated using (
  exists (select 1 from public.albums al where al.id = album_assets.album_id and al.user_id = auth.uid()::text)
  and exists (select 1 from public.assets s where s.id = album_assets.asset_id and s.user_id = auth.uid()::text)
) with check (
  exists (select 1 from public.albums al where al.id = album_assets.album_id and al.user_id = auth.uid()::text)
  and exists (select 1 from public.assets s where s.id = album_assets.asset_id and s.user_id = auth.uid()::text)
);

-- asset_tags
drop policy if exists "asset_tags_via_asset" on public.asset_tags;
create policy "asset_tags_via_asset" on public.asset_tags for all to authenticated using (
  exists (select 1 from public.assets a where a.id = asset_tags.asset_id and a.user_id = auth.uid()::text)
) with check (
  exists (select 1 from public.assets a where a.id = asset_tags.asset_id and a.user_id = auth.uid()::text)
);

-- asset_locations
drop policy if exists "asset_locations_via_asset" on public.asset_locations;
create policy "asset_locations_via_asset" on public.asset_locations for all to authenticated using (
  exists (select 1 from public.assets a where a.id = asset_locations.asset_id and a.user_id = auth.uid()::text)
) with check (
  exists (select 1 from public.assets a where a.id = asset_locations.asset_id and a.user_id = auth.uid()::text)
);

-- locations (sense user_id: vinculades per asset_locations)
drop policy if exists "locations_select_linked" on public.locations;
create policy "locations_select_linked" on public.locations for select to authenticated using (
  exists (
    select 1 from public.asset_locations al
    join public.assets a on a.id = al.asset_id
    where al.location_id = locations.id and a.user_id = auth.uid()::text
  )
);

drop policy if exists "locations_insert_authenticated" on public.locations;
create policy "locations_insert_authenticated" on public.locations for insert to authenticated with check (true);
