-- To de color triat per l'usuari per la vista "per colors" (null = sense assignar).
alter table assets add column if not exists color_hue int null;

comment on column assets.color_hue is 'Hue 0–359 per agrupar a la vista per colors; null si l’usuari no n’ha triat cap.';
