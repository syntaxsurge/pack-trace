alter table public.batches
  add column if not exists product_name text not null default '';

alter table public.batches
  alter column product_name drop default;

