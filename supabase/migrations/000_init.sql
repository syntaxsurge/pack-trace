-- Enable required extensions
create extension if not exists "pgcrypto";

-- Enumerated types
create type facility_type as enum ('MANUFACTURER', 'DISTRIBUTOR', 'PHARMACY', 'AUDITOR');
create type user_role as enum ('ADMIN', 'STAFF', 'AUDITOR');
create type event_type as enum ('MANUFACTURED', 'RECEIVED', 'HANDOVER', 'DISPENSED', 'RECALLED');
create type receipt_status as enum ('ACTIVE', 'REVOKED');

-- Core tables
create table public.facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  type facility_type not null,
  country text,
  gs1_company_prefix text,
  created_at timestamptz not null default now()
);

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique check (position('@' in email) > 0),
  display_name text,
  facility_id uuid references public.facilities (id) on delete set null,
  role user_role not null default 'STAFF',
  created_at timestamptz not null default now()
);

create table public.batches (
  id uuid primary key default gen_random_uuid(),
  gtin text not null,
  lot text not null,
  expiry date not null,
  qty integer not null check (qty > 0),
  current_owner_facility_id uuid references public.facilities (id) on delete set null,
  label_text text not null check (char_length(trim(label_text)) > 0),
  topic_id text,
  created_by_user_id uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches (id) on delete cascade,
  type event_type not null,
  from_facility_id uuid references public.facilities (id) on delete set null,
  to_facility_id uuid references public.facilities (id) on delete set null,
  hcs_tx_id text not null check (char_length(trim(hcs_tx_id)) > 0),
  hcs_seq_no bigint,
  hcs_running_hash text,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  created_by_user_id uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (from_facility_id is not null or to_facility_id is not null),
  check (hcs_seq_no is null or hcs_seq_no >= 0)
);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches (id) on delete cascade,
  pharmacy_facility_id uuid references public.facilities (id) on delete set null,
  patient_ref text,
  shortcode text not null check (char_length(trim(shortcode)) > 0),
  status receipt_status not null default 'ACTIVE',
  created_at timestamptz not null default now()
);

-- Helpful indexes
create index batches_gtin_idx on public.batches (gtin);
create index batches_lot_idx on public.batches (lot);
create unique index batches_gtin_lot_key on public.batches (gtin, lot);
create index events_batch_idx on public.events (batch_id);
create index events_created_at_idx on public.events (created_at desc);
create index events_type_created_at_idx on public.events (type, created_at desc);
create unique index events_payload_hash_key on public.events (payload_hash);
create index receipts_batch_idx on public.receipts (batch_id);
create unique index receipts_shortcode_key on public.receipts (shortcode);

-- Helper functions for RLS checks
create or replace function public.get_my_facility()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.facility_id
  from public.users u
  where u.id = auth.uid();
$$;

create or replace function public.is_auditor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role = 'AUDITOR'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role = 'ADMIN'
  );
$$;

create or replace function public.sync_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  preferred_name text;
  normalized_email text;
begin
  if (tg_op = 'DELETE') then
    delete from public.users where id = old.id;
    return old;
  end if;

  normalized_email := lower(trim(new.email));
  preferred_name := nullif(trim(coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name')),'');

  insert into public.users (id, email, display_name)
  values (
    new.id,
    normalized_email,
    coalesce(preferred_name, new.email)
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(excluded.display_name, public.users.display_name);

  return new;
end;
$$;

create trigger on_auth_user_synced
after insert or update or delete on auth.users
for each row execute function public.sync_user_profile();

-- Enable RLS
alter table public.facilities enable row level security;
alter table public.users enable row level security;
alter table public.batches enable row level security;
alter table public.events enable row level security;
alter table public.receipts enable row level security;

-- RLS policies
create policy "Facilities readable by membership or auditor"
on public.facilities
for select
using (
  is_auditor()
  or facilities.id = get_my_facility()
);

create policy "Facilities insert restricted to auditors"
on public.facilities
for insert
with check (
  is_auditor()
);

create policy "Facilities updateable by admin of facility or auditor"
on public.facilities
for update
using (
  is_auditor()
  or (
    facilities.id = get_my_facility()
    and is_admin()
  )
)
with check (
  is_auditor()
  or (
    facilities.id = get_my_facility()
    and is_admin()
  )
);

create policy "Facilities deletable by auditors"
on public.facilities
for delete
using (
  is_auditor()
);

create policy "Users visible to same facility or self or auditor"
on public.users
for select
using (
  is_auditor()
  or auth.uid() = users.id
  or users.facility_id = get_my_facility()
);

create policy "Users create within facility"
on public.users
for insert
with check (
  is_auditor()
  or (
    users.facility_id = get_my_facility()
    and is_admin()
  )
);

create policy "Users update within facility"
on public.users
for update
using (
  is_auditor()
  or auth.uid() = users.id
  or users.facility_id = get_my_facility()
)
with check (
  is_auditor()
  or (
    users.facility_id = get_my_facility()
    and is_admin()
  )
  or auth.uid() = users.id
);

create policy "Users deletable by auditors"
on public.users
for delete
using (
  is_auditor()
);

create policy "Batches readable by owner facility or auditor"
on public.batches
for select
using (
  is_auditor()
  or batches.current_owner_facility_id = get_my_facility()
);

create policy "Batches writeable by owner facility"
on public.batches
for insert
with check (
  is_auditor()
  or (
    batches.current_owner_facility_id = get_my_facility()
    and batches.created_by_user_id = auth.uid()
  )
);

create policy "Batches updateable by owner facility"
on public.batches
for update
using (
  is_auditor()
  or batches.current_owner_facility_id = get_my_facility()
)
with check (
  is_auditor()
  or (
    batches.current_owner_facility_id = get_my_facility()
    and batches.created_by_user_id = auth.uid()
  )
);

create policy "Events readable by involved facilities or auditor"
on public.events
for select
using (
  is_auditor()
  or get_my_facility() is not null and (
    events.from_facility_id = get_my_facility()
    or events.to_facility_id = get_my_facility()
    or events.created_by_user_id = auth.uid()
    or exists (
      select 1
      from public.batches b
      where b.id = events.batch_id
        and b.current_owner_facility_id = get_my_facility()
    )
  )
);

create policy "Events writeable by involved facilities"
on public.events
for insert
with check (
  is_auditor()
  or (
    events.created_by_user_id = auth.uid()
    and get_my_facility() is not null and (
      events.from_facility_id = get_my_facility()
      or events.to_facility_id = get_my_facility()
      or exists (
        select 1
        from public.batches b
        where b.id = events.batch_id
          and b.current_owner_facility_id = get_my_facility()
      )
    )
  )
);

create policy "Events updateable by involved facilities"
on public.events
for update
using (
  is_auditor()
  or get_my_facility() is not null and (
    events.from_facility_id = get_my_facility()
    or events.to_facility_id = get_my_facility()
    or events.created_by_user_id = auth.uid()
    or exists (
      select 1
      from public.batches b
      where b.id = events.batch_id
        and b.current_owner_facility_id = get_my_facility()
    )
  )
)
with check (
  is_auditor()
  or get_my_facility() is not null and (
    events.from_facility_id = get_my_facility()
    or events.to_facility_id = get_my_facility()
    or exists (
      select 1
      from public.batches b
      where b.id = events.batch_id
        and b.current_owner_facility_id = get_my_facility()
    )
    or events.created_by_user_id = auth.uid()
  )
);

create policy "Receipts readable by pharmacy facility or auditor"
on public.receipts
for select
using (
  is_auditor()
  or public.receipts.pharmacy_facility_id = get_my_facility()
);

create policy "Receipts writeable by pharmacy facility"
on public.receipts
for insert
with check (
  is_auditor()
  or public.receipts.pharmacy_facility_id = get_my_facility()
);

create policy "Receipts updateable by pharmacy facility"
on public.receipts
for update
using (
  is_auditor()
  or public.receipts.pharmacy_facility_id = get_my_facility()
)
with check (
  is_auditor()
  or public.receipts.pharmacy_facility_id = get_my_facility()
);
