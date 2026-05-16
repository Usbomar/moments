-- Color complet #RRGGBB (no només to 0–359)
alter table assets add column if not exists color_hex text null;

comment on column assets.color_hex is 'Color #RRGGBB per agrupar a la vista per colors; null si no n’hi ha cap assignat.';

alter table assets drop constraint if exists assets_color_hex_format;
alter table assets add constraint assets_color_hex_format check (
  color_hex is null or color_hex ~ '^#[0-9a-fA-F]{6}$'
);
