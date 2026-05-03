-- Mida intermèdia per visors / zoom (WebP ~800px costat llarg)
alter table asset_files add column if not exists medium_url text;
