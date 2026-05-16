-- Color complet #RRGGBB (executar al SQL Editor de Supabase si la migració automàtica falla)
alter table public.assets add column if not exists color_hex text null;

comment on column public.assets.color_hex is 'Color #RRGGBB per agrupar a la vista per colors; null si no n’hi ha cap assignat.';

alter table public.assets drop constraint if exists assets_color_hex_format;

alter table public.assets add constraint assets_color_hex_format check (
  color_hex is null or color_hex ~ '^#[0-9a-fA-F]{6}$'
);
