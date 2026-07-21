
create table public.schedule_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_date date not null,
  start_time time without time zone,
  end_time time without time zone,
  assignee text not null default '',
  team text not null default '',
  location text not null default '',
  description text not null default '',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint schedule_events_title_length
    check (char_length(btrim(title)) between 1 and 100),
  constraint schedule_events_assignee_length
    check (char_length(assignee) <= 120),
  constraint schedule_events_team_length
    check (char_length(team) <= 80),
  constraint schedule_events_location_length
    check (char_length(location) <= 120),
  constraint schedule_events_description_length
    check (char_length(description) <= 2000),
  constraint schedule_events_time_order
    check (
      start_time is null
      or end_time is null
      or end_time >= start_time
    )
);

comment on table public.schedule_events is
  'Shared schedule for the Mononoke no Kagi team.';
comment on column public.schedule_events.assignee is
  'Free-form person or people responsible for the event.';
comment on column public.schedule_events.team is
  'Free-form team or group name.';

create index schedule_events_event_date_idx
  on public.schedule_events (event_date, start_time);
create index schedule_events_updated_at_idx
  on public.schedule_events (updated_at desc);

create function public.touch_schedule_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

create trigger schedule_events_touch
before update on public.schedule_events
for each row
execute function public.touch_schedule_event();

alter table public.schedule_events enable row level security;
alter table public.schedule_events force row level security;

revoke all on table public.schedule_events from anon;
grant select, insert, update, delete
  on table public.schedule_events
  to authenticated;

create policy "discord users can read the shared schedule"
on public.schedule_events
for select
to authenticated
using (
  auth.jwt() -> 'app_metadata' ->> 'provider' = 'discord'
);

create policy "discord users can add schedule events"
on public.schedule_events
for insert
to authenticated
with check (
  auth.jwt() -> 'app_metadata' ->> 'provider' = 'discord'
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

create policy "discord users can edit shared schedule events"
on public.schedule_events
for update
to authenticated
using (
  auth.jwt() -> 'app_metadata' ->> 'provider' = 'discord'
)
with check (
  auth.jwt() -> 'app_metadata' ->> 'provider' = 'discord'
);

create policy "discord users can delete shared schedule events"
on public.schedule_events
for delete
to authenticated
using (
  auth.jwt() -> 'app_metadata' ->> 'provider' = 'discord'
);

alter table public.schedule_events replica identity full;
alter publication supabase_realtime add table public.schedule_events;

revoke all on function public.touch_schedule_event() from public;
