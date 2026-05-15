-- Paleta de colors personalitzada per usuari (Configuració > Colors)
alter table public.profiles
  add column if not exists color_palette jsonb not null default '{"custom":[],"presetLabels":{}}'::jsonb;

comment on column public.profiles.color_palette is 'JSON: { "custom": [{ "id", "label", "hue" }], "presetLabels": { "30": "nom opcional" } }';
