drop policy if exists "Batches readable by owner facility or auditor"
on public.batches;

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
      from public.events e
      where e.batch_id = batches.id
        and (
          e.from_facility_id = get_my_facility()
          or e.to_facility_id = get_my_facility()
          or e.created_by_user_id = auth.uid()
        )
    )
  )
);
