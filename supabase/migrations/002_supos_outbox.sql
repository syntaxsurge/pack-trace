create table if not exists public.supos_outbox (
  id bigserial primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  batch_id uuid not null references public.batches(id) on delete cascade,
  topic text not null,
  payload jsonb not null,
  status text not null default 'PENDING' check (status in ('PENDING','IN_PROGRESS','SENT','FAILED')),
  attempts int not null default 0,
  next_retry_at timestamptz not null default now(),
  last_error text,
  claimed_by text,
  claimed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists supos_outbox_event_topic_ux on public.supos_outbox(event_id, topic);
create index if not exists supos_outbox_status_next_retry_idx on public.supos_outbox(status, next_retry_at);

create or replace function public.enqueue_supos_outbox() returns trigger as $$
declare
  v_payload jsonb;
  v_batch record;
  v_actor_role text;
  v_prev_payload_hash text;
begin
  select b.gtin, b.lot, b.expiry
    into v_batch
    from public.batches b
   where b.id = NEW.batch_id;

  select u.role
    into v_actor_role
    from public.users u
   where u.id = NEW.created_by_user_id;

  select e.payload_hash
    into v_prev_payload_hash
    from public.events e
   where e.batch_id = NEW.batch_id
     and e.id <> NEW.id
   order by e.created_at desc
   limit 1;

  v_payload := jsonb_build_object(
    'v', 1,
    'type', NEW.type,
    'batch', jsonb_build_object(
      'id', NEW.batch_id,
      'gtin', coalesce(v_batch.gtin, ''),
      'lot', coalesce(v_batch.lot, ''),
      'exp', coalesce(to_char(v_batch.expiry, 'YYYY-MM-DD'), '')
    ),
    'actor', jsonb_build_object(
      'facilityId', NEW.from_facility_id,
      'role', coalesce(v_actor_role, 'UNKNOWN')
    ),
    'to', case
      when NEW.to_facility_id is null then null
      else jsonb_build_object('facilityId', NEW.to_facility_id)
    end,
    'ts', NEW.created_at,
    'prev', case
      when v_prev_payload_hash is null then null
      else format('sha256:%s', v_prev_payload_hash)
    end,
    'meta', jsonb_strip_nulls(
      jsonb_build_object(
        'handoverEventId', NEW.handover_event_id
      )
    ),
    'event', jsonb_strip_nulls(
      jsonb_build_object(
        'id', NEW.id,
        'hcsTxId', NEW.hcs_tx_id,
        'hcsSeqNo', NEW.hcs_seq_no,
        'hcsRunningHash', NEW.hcs_running_hash,
        'payloadHash', NEW.payload_hash
      )
    )
  );

  insert into public.supos_outbox(event_id, batch_id, topic, payload)
  values (NEW.id, NEW.batch_id, 'trace/events', v_payload);

  return NEW;
end
$$ language plpgsql;

drop trigger if exists trg_enqueue_supos_outbox on public.events;
create trigger trg_enqueue_supos_outbox
after insert on public.events
for each row execute function public.enqueue_supos_outbox();

create or replace function public.claim_supos_outbox(p_worker_id text, p_batch int)
returns setof public.supos_outbox
language plpgsql
as $$
declare
  r public.supos_outbox%rowtype;
begin
  for r in
    select *
    from public.supos_outbox
    where status = 'PENDING' and next_retry_at <= now()
    order by created_at
    for update skip locked
    limit p_batch
  loop
    update public.supos_outbox
    set status = 'IN_PROGRESS', claimed_by = p_worker_id, claimed_at = now()
    where id = r.id
    returning * into r;
    return next r;
  end loop;
  return;
end;
$$;
