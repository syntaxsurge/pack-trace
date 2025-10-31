create table if not exists public.batch_participants (
  batch_id uuid not null references public.batches (id) on delete cascade,
  facility_id uuid not null references public.facilities (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (batch_id, facility_id)
);

create or replace function public.add_batch_participant(batch_id uuid, facility_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if facility_id is null then
    return;
  end if;

  insert into public.batch_participants (batch_id, facility_id)
  values (batch_id, facility_id)
  on conflict do nothing;
end;
$$;

create or replace function public.handle_batch_participants_on_batch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.add_batch_participant(new.id, new.current_owner_facility_id);
  return new;
end;
$$;

create or replace function public.handle_batch_participants_on_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.add_batch_participant(new.batch_id, new.from_facility_id);
  perform public.add_batch_participant(new.batch_id, new.to_facility_id);
  return new;
end;
$$;

drop trigger if exists batches_participants_after_insert on public.batches;

create trigger batches_participants_after_insert
after insert on public.batches
for each row
execute function public.handle_batch_participants_on_batch();

drop trigger if exists batches_participants_after_update on public.batches;

create trigger batches_participants_after_update
after update of current_owner_facility_id on public.batches
for each row
when (new.current_owner_facility_id is distinct from old.current_owner_facility_id)
execute function public.handle_batch_participants_on_batch();

drop trigger if exists events_participants_after_insert on public.events;

create trigger events_participants_after_insert
after insert on public.events
for each row
execute function public.handle_batch_participants_on_event();

insert into public.batch_participants (batch_id, facility_id)
select id, current_owner_facility_id
from public.batches
where current_owner_facility_id is not null
on conflict do nothing;

insert into public.batch_participants (batch_id, facility_id)
select batch_id, from_facility_id
from public.events
where from_facility_id is not null
on conflict do nothing;

insert into public.batch_participants (batch_id, facility_id)
select batch_id, to_facility_id
from public.events
where to_facility_id is not null
on conflict do nothing;

drop policy if exists "Batches readable by participants or auditor" on public.batches;

create policy "Batches readable by participants or auditor"
on public.batches
for select
using (
  is_auditor()
  or batches.current_owner_facility_id = get_my_facility()
  or batches.created_by_user_id = auth.uid()
  or (
    get_my_facility() is not null
    and exists (
      select 1
      from public.batch_participants bp
      where bp.batch_id = batches.id
        and bp.facility_id = get_my_facility()
    )
  )
);

drop policy if exists "Events readable by participants or auditor" on public.events;
drop policy if exists "Events writeable by participants" on public.events;
drop policy if exists "Events updateable by participants" on public.events;
drop policy if exists "Events readable by involved facilities or auditor" on public.events;
drop policy if exists "Events writeable by involved facilities" on public.events;
drop policy if exists "Events updateable by involved facilities" on public.events;

create policy "Events readable by participants or auditor"
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
      from public.batch_participants bp
      where bp.batch_id = events.batch_id
        and bp.facility_id = get_my_facility()
    )
  )
);

create policy "Events writeable by participants"
on public.events
for insert
with check (
  is_auditor()
  or (
    events.created_by_user_id = auth.uid()
    and get_my_facility() is not null
    and (
      events.from_facility_id = get_my_facility()
      or events.to_facility_id = get_my_facility()
      or exists (
        select 1
        from public.batch_participants bp
        where bp.batch_id = events.batch_id
          and bp.facility_id = get_my_facility()
      )
    )
  )
);

create policy "Events updateable by participants"
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
      from public.batch_participants bp
      where bp.batch_id = events.batch_id
        and bp.facility_id = get_my_facility()
    )
  )
)
with check (
  is_auditor()
  or get_my_facility() is not null and (
    events.from_facility_id = get_my_facility()
    or events.to_facility_id = get_my_facility()
    or events.created_by_user_id = auth.uid()
    or exists (
      select 1
      from public.batch_participants bp
      where bp.batch_id = events.batch_id
        and bp.facility_id = get_my_facility()
    )
  )
);
