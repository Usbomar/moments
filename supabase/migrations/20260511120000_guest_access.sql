-- Accés convidat: perfil (slug, directori opt-in) + restricció per foto.

alter table public.profiles
  add column if not exists guest_access_enabled boolean not null default false;

alter table public.profiles
  add column if not exists guest_slug text;

alter table public.profiles
  add column if not exists show_in_guest_directory boolean not null default false;

alter table public.profiles
  add column if not exists guest_display_name text;

create unique index if not exists profiles_guest_slug_unique on public.profiles (guest_slug) where guest_slug is not null;

alter table public.assets
  add column if not exists hidden_from_guests boolean not null default false;

create index if not exists idx_assets_user_hidden_guest on public.assets (user_id, hidden_from_guests);
