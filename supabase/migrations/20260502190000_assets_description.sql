-- Add optional description for asset metadata editing (Photo modal)

alter table if exists assets
  add column if not exists description text;
