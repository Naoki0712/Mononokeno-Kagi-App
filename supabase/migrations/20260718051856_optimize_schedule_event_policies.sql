
create index schedule_events_created_by_idx
  on public.schedule_events (created_by)
  where created_by is not null;

create index schedule_events_updated_by_idx
  on public.schedule_events (updated_by)
  where updated_by is not null;

drop policy "discord users can read the shared schedule"
  on public.schedule_events;
drop policy "discord users can add schedule events"
  on public.schedule_events;
drop policy "discord users can edit shared schedule events"
  on public.schedule_events;
drop policy "discord users can delete shared schedule events"
  on public.schedule_events;

create policy "discord users can read the shared schedule"
on public.schedule_events
for select
to authenticated
using (
  (select auth.jwt()) -> 'app_metadata' ->> 'provider' = 'discord'
);

create policy "discord users can add schedule events"
on public.schedule_events
for insert
to authenticated
with check (
  (select auth.jwt()) -> 'app_metadata' ->> 'provider' = 'discord'
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
);

create policy "discord users can edit shared schedule events"
on public.schedule_events
for update
to authenticated
using (
  (select auth.jwt()) -> 'app_metadata' ->> 'provider' = 'discord'
)
with check (
  (select auth.jwt()) -> 'app_metadata' ->> 'provider' = 'discord'
);

create policy "discord users can delete shared schedule events"
on public.schedule_events
for delete
to authenticated
using (
  (select auth.jwt()) -> 'app_metadata' ->> 'provider' = 'discord'
);
