-- Reassigna tot el contingut (assets, albums) a l’únic usuari registrat a Auth.
-- Executa només quan hi ha exactament UN usuari a auth.users (evita errors amb diversos comptes).
--
-- Abans (opcional): revisa quins user_id hi ha ara:
--   select user_id, count(*) from public.assets group by user_id;
--   select user_id, count(*) from public.albums group by user_id;

do $$
declare
  uid_text text;
  user_count int;
  assets_updated int;
  albums_updated int;
begin
  select count(*)::int into user_count from auth.users;
  if user_count <> 1 then
    raise exception 'Moments: cal exactament 1 usuari a auth.users (n=%). Ajusta el SQL manualment o crea/suprimeix usuaris.', user_count;
  end if;

  select id::text into uid_text from auth.users limit 1;

  update public.assets
  set user_id = uid_text
  where user_id is distinct from uid_text;
  get diagnostics assets_updated = row_count;

  update public.albums
  set user_id = uid_text
  where user_id is distinct from uid_text;
  get diagnostics albums_updated = row_count;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'profiles'
  ) then
    insert into public.profiles (id, role)
    values (uid_text::uuid, 'owner')
    on conflict (id) do nothing;
  end if;

  raise notice 'Moments: user_id assignat a %. Assets actualitzats: %. Albums actualitzats: %.', uid_text, assets_updated, albums_updated;
end $$;
