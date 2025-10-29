alter table public.batches
  add column pending_receipt_to_facility_id uuid references public.facilities (id) on delete set null,
  add column last_handover_event_id uuid references public.events (id) on delete set null;

alter table public.events
  add column handover_event_id uuid references public.events (id) on delete set null;

create table public.idempotency_keys (
  key text primary key,
  event_id uuid references public.events (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index events_once_manufactured_idx
  on public.events (batch_id)
  where type = 'MANUFACTURED';

create unique index events_once_dispensed_idx
  on public.events (batch_id)
  where type = 'DISPENSED';

create unique index events_receive_once_per_handover_idx
  on public.events (handover_event_id)
  where type = 'RECEIVED'
    and handover_event_id is not null;

create index batches_pending_receipt_idx
  on public.batches (pending_receipt_to_facility_id);
