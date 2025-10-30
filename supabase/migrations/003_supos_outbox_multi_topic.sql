-- Allow publishing the same event payload to multiple SupOS topics
drop index if exists supos_outbox_event_id_ux;

create unique index if not exists supos_outbox_event_topic_ux
  on public.supos_outbox(event_id, topic);

create or replace function public.enqueue_supos_outbox() returns trigger as $$
declare
  v_topic text;
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

  v_topic := format('trace/batches/%s/events', NEW.batch_id);
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
  values (NEW.id, NEW.batch_id, v_topic, v_payload);

  insert into public.supos_outbox(event_id, batch_id, topic, payload)
  values (NEW.id, NEW.batch_id, 'trace/events', v_payload);

  return NEW;
end
$$ language plpgsql;
