-- Moments app schema + storage bucket (local / remote migrations)

create table if not exists assets (
  id text primary key,
  user_id text not null,
  type text not null check (type in ('photo', 'video')),
  title text not null,
  taken_at timestamptz not null,
  uploaded_at timestamptz not null,
  width int not null,
  height int not null,
  duration int,
  favorite boolean default false
);

create table if not exists asset_files (
  asset_id text primary key references assets(id) on delete cascade,
  original_url text not null,
  preview_url text not null,
  thumb_url text not null,
  checksum text not null,
  size bigint not null
);

create table if not exists albums (
  id text primary key,
  user_id text not null,
  name text not null
);

create table if not exists album_assets (
  album_id text references albums(id) on delete cascade,
  asset_id text references assets(id) on delete cascade,
  position int default 0,
  primary key (album_id, asset_id)
);

create table if not exists locations (
  id bigserial primary key,
  lat double precision not null,
  lng double precision not null,
  city text,
  country text
);

create table if not exists asset_locations (
  asset_id text primary key references assets(id) on delete cascade,
  location_id bigint not null references locations(id) on delete cascade
);

create table if not exists asset_tags (
  asset_id text references assets(id) on delete cascade,
  tag text not null,
  origin text not null check (origin in ('manual', 'auto')),
  primary key (asset_id, tag, origin)
);

create index if not exists idx_assets_user_taken_at on assets(user_id, taken_at desc);
create index if not exists idx_assets_user_favorite on assets(user_id, favorite);
create index if not exists idx_asset_tags_tag on asset_tags(tag);

insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', true)
on conflict (id) do nothing;
