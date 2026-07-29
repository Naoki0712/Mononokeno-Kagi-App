begin;

create schema if not exists private;

-- Stop the legacy two-way mirrors before making the public tables canonical.
-- Preview branches can inherit migration history without the legacy relations,
-- so catch undefined_table explicitly around each legacy-only operation.
do $migration$
begin
  begin
    execute 'drop trigger if exists mirror_member_schedule_to_public on private.member_schedule';
  exception
    when undefined_table then null;
  end;

  begin
    execute 'drop trigger if exists mirror_class_schedule_to_public on private.class_schedule';
  exception
    when undefined_table then null;
  end;
end;
$migration$;
drop function if exists private.mirror_member_schedule_to_public();
drop function if exists private.mirror_class_schedule_to_public();

create table if not exists public.member_schedule (
  id text,
  password text,
  user_id uuid,
  display_name text not null default 'クラスメイト',
  discord_id text,
  available_date date,
  status text,
  updated_at timestamptz not null default now()
);

alter table public.member_schedule
  drop constraint if exists member_schedule_id_check,
  drop constraint if exists member_schedule_password_check,
  drop constraint if exists member_schedule_availability_pair_check,
  drop constraint if exists member_schedule_user_id_fkey;

alter table public.member_schedule
  alter column id drop not null,
  alter column password drop not null,
  alter column display_name set default 'クラスメイト';

drop index if exists public.member_schedule_id_date_key;
drop index if exists public.member_schedule_profile_user_key;
drop index if exists public.member_schedule_user_date_idx;
drop index if exists public.member_schedule_user_date_key;

-- Merge Discord approval profiles into the profile rows (available_date is null).
do $$
begin
  if to_regclass('public.portal_members') is not null then
    update public.member_schedule as destination
    set display_name = source.display_name,
        discord_id = source.discord_id,
        status = source.status,
        updated_at = greatest(destination.updated_at, source.requested_at)
    from public.portal_members as source
    where destination.user_id = source.user_id
      and destination.available_date is null;

    insert into public.member_schedule (
      id,
      password,
      user_id,
      display_name,
      discord_id,
      available_date,
      status,
      updated_at
    )
    select
      null,
      null,
      source.user_id,
      source.display_name,
      source.discord_id,
      null,
      source.status,
      coalesce(source.reviewed_at, source.requested_at, now())
    from public.portal_members as source
    where not exists (
      select 1
      from public.member_schedule as destination
      where destination.user_id = source.user_id
        and destination.available_date is null
    );
  end if;
end;
$$;

-- Merge the existing availability answers into member_schedule.
do $$
begin
  if to_regclass('public.member_availability') is not null then
    update public.member_schedule as destination
    set status = source.status,
        updated_at = greatest(destination.updated_at, source.updated_at)
    from public.member_availability as source
    where destination.user_id = source.user_id
      and destination.available_date = source.available_date;

    insert into public.member_schedule (
      id,
      password,
      user_id,
      display_name,
      discord_id,
      available_date,
      status,
      updated_at
    )
    select
      profile.id,
      profile.password,
      source.user_id,
      coalesce(profile.display_name, 'Discordユーザー'),
      profile.discord_id,
      source.available_date,
      source.status,
      source.updated_at
    from public.member_availability as source
    left join lateral (
      select candidate.id,
             candidate.password,
             candidate.display_name,
             candidate.discord_id
      from public.member_schedule as candidate
      where candidate.user_id = source.user_id
        and candidate.available_date is null
      limit 1
    ) as profile on true
    where not exists (
      select 1
      from public.member_schedule as destination
      where destination.user_id = source.user_id
        and destination.available_date = source.available_date
    );
  end if;
end;
$$;

update public.member_schedule
set status = 'pending'
where user_id is not null
  and available_date is null
  and status is null;

alter table public.member_schedule
  add constraint member_schedule_id_check
    check (id is null or id ~ '^[0-9]{4}$'),
  add constraint member_schedule_password_check
    check (password is null or password like '$2%'),
  add constraint member_schedule_credentials_pair_check
    check ((id is null and password is null) or (id is not null and password is not null)),
  add constraint member_schedule_record_check
    check (
      (
        available_date is null
        and (
          (user_id is null and status is null)
          or status in ('pending', 'approved', 'rejected')
        )
      )
      or (
        available_date is not null
        and status in ('available', 'unavailable')
      )
    ),
  add constraint member_schedule_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;

create unique index member_schedule_user_date_key
  on public.member_schedule (user_id, available_date);

create unique index member_schedule_profile_user_key
  on public.member_schedule (user_id)
  where available_date is null and user_id is not null;

create unique index member_schedule_id_date_key
  on public.member_schedule (id, available_date);

create unique index member_schedule_profile_id_key
  on public.member_schedule (id)
  where available_date is null and id is not null;

create index member_schedule_user_date_idx
  on public.member_schedule (user_id, available_date);

create table if not exists public.class_schedule (
  id text not null default (gen_random_uuid()::text),
  password text,
  available_date date,
  available_time time without time zone,
  updated_at timestamptz not null default now()
);

alter table public.class_schedule
  drop constraint if exists class_schedule_id_check,
  drop constraint if exists class_schedule_password_check,
  drop constraint if exists class_schedule_time_pair_check,
  drop constraint if exists class_schedule_pkey,
  drop constraint if exists class_schedule_created_by_fkey,
  drop constraint if exists class_schedule_updated_by_fkey;

alter table public.class_schedule
  alter column id set default (gen_random_uuid()::text),
  alter column password drop not null,
  add column if not exists title text,
  add column if not exists end_time time without time zone,
  add column if not exists assignee text not null default '',
  add column if not exists team text not null default '',
  add column if not exists location text not null default '',
  add column if not exists description text not null default '',
  add column if not exists created_by uuid default auth.uid(),
  add column if not exists updated_by uuid default auth.uid(),
  add column if not exists created_at timestamptz not null default now();

drop index if exists public.class_schedule_id_date_time_key;
drop index if exists public.class_schedule_available_at_idx;

alter table public.class_schedule
  add constraint class_schedule_pkey primary key (id);

-- Merge shared schedule events into class_schedule. Credential rows have title = null.
do $$
begin
  if to_regclass('public.schedule_events') is not null then
    insert into public.class_schedule (
      id,
      password,
      available_date,
      available_time,
      updated_at,
      title,
      end_time,
      assignee,
      team,
      location,
      description,
      created_by,
      updated_by,
      created_at
    )
    select
      source.id::text,
      null,
      source.event_date,
      source.start_time,
      source.updated_at,
      source.title,
      source.end_time,
      source.assignee,
      source.team,
      source.location,
      source.description,
      source.created_by,
      source.updated_by,
      source.created_at
    from public.schedule_events as source
    on conflict (id) do update
    set available_date = excluded.available_date,
        available_time = excluded.available_time,
        updated_at = excluded.updated_at,
        title = excluded.title,
        end_time = excluded.end_time,
        assignee = excluded.assignee,
        team = excluded.team,
        location = excluded.location,
        description = excluded.description,
        created_by = excluded.created_by,
        updated_by = excluded.updated_by,
        created_at = excluded.created_at;
  end if;
end;
$$;

alter table public.class_schedule
  add constraint class_schedule_password_check
    check (password is null or password like '$2%'),
  add constraint class_schedule_record_check
    check (
      (
        title is null
        and id ~ '^[0-9]{4}$'
        and password is not null
        and available_date is null
        and available_time is null
        and end_time is null
      )
      or (
        title is not null
        and id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and password is null
        and available_date is not null
      )
    ),
  add constraint class_schedule_title_length
    check (title is null or (char_length(btrim(title)) between 1 and 100)),
  add constraint class_schedule_time_order
    check (available_time is null or end_time is null or end_time >= available_time),
  add constraint class_schedule_assignee_length
    check (char_length(assignee) <= 120),
  add constraint class_schedule_team_length
    check (char_length(team) <= 80),
  add constraint class_schedule_location_length
    check (char_length(location) <= 120),
  add constraint class_schedule_description_length
    check (char_length(description) <= 2000),
  add constraint class_schedule_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null,
  add constraint class_schedule_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;

create index class_schedule_available_at_idx
  on public.class_schedule (available_date, available_time)
  where title is not null;

create or replace function private.touch_member_schedule()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.touch_class_schedule()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.title is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

revoke all on function private.touch_member_schedule() from public, anon, authenticated;
revoke all on function private.touch_class_schedule() from public, anon, authenticated;

drop trigger if exists member_schedule_touch on public.member_schedule;
create trigger member_schedule_touch
before update on public.member_schedule
for each row execute function private.touch_member_schedule();

drop trigger if exists class_schedule_touch on public.class_schedule;
create trigger class_schedule_touch
before update on public.class_schedule
for each row execute function private.touch_class_schedule();

create or replace function private.is_portal_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'portal_role', '') = 'admin';
$$;

create or replace function private.is_approved_member(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.member_schedule as profile
    where profile.user_id = p_user_id
      and profile.available_date is null
      and profile.status = 'approved'
  );
$$;

revoke all on function private.is_portal_admin() from public, anon, authenticated;
revoke all on function private.is_approved_member(uuid) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_portal_admin() to authenticated;
grant execute on function private.is_approved_member(uuid) to authenticated;

alter table public.member_schedule enable row level security;
alter table public.class_schedule enable row level security;

do $$
declare
  policy record;
begin
  for policy in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'member_schedule'
  loop
    execute format('drop policy %I on public.member_schedule', policy.policyname);
  end loop;

  for policy in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'class_schedule'
  loop
    execute format('drop policy %I on public.class_schedule', policy.policyname);
  end loop;
end;
$$;

create policy "members can read own schedule rows"
on public.member_schedule
for select
to authenticated
using ((select auth.uid()) = user_id or private.is_portal_admin());

create policy "members can request Discord approval or add availability"
on public.member_schedule
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and (
    (
      available_date is null
      and status = 'pending'
      and id is null
      and password is null
    )
    or (
      available_date is not null
      and status in ('available', 'unavailable')
      and private.is_approved_member((select auth.uid()))
      and extract(isodow from available_date) between 1 and 5
      and available_date not between date '2026-08-10' and date '2026-08-17'
    )
  )
);

create policy "members can update own availability"
on public.member_schedule
for update
to authenticated
using (
  (select auth.uid()) = user_id
  and available_date is not null
  and private.is_approved_member((select auth.uid()))
)
with check (
  (select auth.uid()) = user_id
  and available_date is not null
  and status in ('available', 'unavailable')
  and private.is_approved_member((select auth.uid()))
  and extract(isodow from available_date) between 1 and 5
  and available_date not between date '2026-08-10' and date '2026-08-17'
);

create policy "members can delete own availability"
on public.member_schedule
for delete
to authenticated
using (
  (select auth.uid()) = user_id
  and available_date is not null
  and private.is_approved_member((select auth.uid()))
);

create policy "admins can review member profiles"
on public.member_schedule
for update
to authenticated
using (private.is_portal_admin())
with check (private.is_portal_admin());

create policy "admins can delete member rows"
on public.member_schedule
for delete
to authenticated
using (private.is_portal_admin());

create policy "approved members can read shared schedule"
on public.class_schedule
for select
to authenticated
using (
  title is not null
  and (private.is_approved_member((select auth.uid())) or private.is_portal_admin())
);

create policy "approved members can add shared schedule"
on public.class_schedule
for insert
to authenticated
with check (
  title is not null
  and password is null
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and (private.is_approved_member((select auth.uid())) or private.is_portal_admin())
);

create policy "approved members can edit shared schedule"
on public.class_schedule
for update
to authenticated
using (
  title is not null
  and (private.is_approved_member((select auth.uid())) or private.is_portal_admin())
)
with check (
  title is not null
  and password is null
  and updated_by = (select auth.uid())
  and (private.is_approved_member((select auth.uid())) or private.is_portal_admin())
);

create policy "approved members can delete shared schedule"
on public.class_schedule
for delete
to authenticated
using (
  title is not null
  and (private.is_approved_member((select auth.uid())) or private.is_portal_admin())
);

revoke all on table public.member_schedule from public, anon, authenticated;
revoke all on table public.class_schedule from public, anon, authenticated;

grant select (id, user_id, display_name, discord_id, available_date, status, updated_at)
  on public.member_schedule to authenticated;
grant insert (user_id, display_name, discord_id, available_date, status)
  on public.member_schedule to authenticated;
grant update (user_id, display_name, discord_id, available_date, status)
  on public.member_schedule to authenticated;
grant delete on public.member_schedule to authenticated;

grant select (
  id,
  available_date,
  available_time,
  updated_at,
  title,
  end_time,
  assignee,
  team,
  location,
  description,
  created_by,
  updated_by,
  created_at
) on public.class_schedule to authenticated;
grant insert (
  available_date,
  available_time,
  title,
  end_time,
  assignee,
  team,
  location,
  description,
  created_by,
  updated_by
) on public.class_schedule to authenticated;
grant update (
  available_date,
  available_time,
  title,
  end_time,
  assignee,
  team,
  location,
  description,
  updated_by
) on public.class_schedule to authenticated;
grant delete on public.class_schedule to authenticated;

create or replace function public.classmate_schedule(p_token text)
returns table (
  id uuid,
  title text,
  event_date date,
  start_time time without time zone,
  end_time time without time zone,
  assignee text,
  team text,
  location text,
  description text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    event.id::uuid,
    event.title,
    event.available_date,
    event.available_time,
    event.end_time,
    event.assignee,
    event.team,
    event.location,
    event.description
  from public.class_schedule as event
  where event.title is not null
    and char_length(p_token) = 64
    and exists (
      select 1
      from private.classmate_sessions as session
      where session.token_hash = extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
        and session.expires_at > now()
        and exists (
          select 1
          from private.class_schedule as credential
          where credential.id = session.student_id
            and credential.available_date is null
            and credential.available_time is null
        )
    )
  order by event.available_date, event.available_time nulls last, event.title;
$$;

revoke all on function public.classmate_schedule(text) from public;
grant execute on function public.classmate_schedule(text) to anon, authenticated;

-- Keep the private credential source in sync without mirroring schedule/availability rows.
create or replace function private.sync_classmate_account_to_public()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.available_date is null and old.available_time is null then
      delete from public.class_schedule
      where id = old.id and title is null;
    end if;
    return old;
  end if;

  if new.available_date is null and new.available_time is null then
    insert into public.class_schedule (
      id,
      password,
      available_date,
      available_time,
      updated_at,
      title
    )
    values (new.id, new.password, null, null, new.updated_at, null)
    on conflict (id) do update
    set password = excluded.password,
        updated_at = excluded.updated_at;
  end if;

  return new;
end;
$$;

create or replace function private.sync_member_password_to_public()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.password is distinct from old.password then
    update public.member_schedule
    set password = new.password,
        updated_at = new.updated_at
    where id = new.id
      and available_date is not distinct from new.available_date;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_classmate_account_to_public() from public, anon, authenticated;
revoke all on function private.sync_member_password_to_public() from public, anon, authenticated;

do $$
begin
  if to_regclass('private.class_schedule') is not null then
    execute 'drop trigger if exists sync_classmate_account_to_public on private.class_schedule';
    execute 'create trigger sync_classmate_account_to_public
      after insert or update or delete on private.class_schedule
      for each row execute function private.sync_classmate_account_to_public()';
  end if;

  if to_regclass('private.member_schedule') is not null then
    execute 'drop trigger if exists sync_member_password_to_public on private.member_schedule';
    execute 'create trigger sync_member_password_to_public
      after update of password on private.member_schedule
      for each row execute function private.sync_member_password_to_public()';
  end if;
end;
$$;

-- Refuse to remove the legacy tables unless every row was copied successfully.
do $$
begin
  if to_regclass('public.portal_members') is not null and exists (
    select 1
    from public.portal_members as source
    where not exists (
      select 1
      from public.member_schedule as destination
      where destination.user_id = source.user_id
        and destination.available_date is null
        and destination.status = source.status
    )
  ) then
    raise exception 'portal_members migration verification failed';
  end if;

  if to_regclass('public.member_availability') is not null and exists (
    select 1
    from public.member_availability as source
    where not exists (
      select 1
      from public.member_schedule as destination
      where destination.user_id = source.user_id
        and destination.available_date = source.available_date
        and destination.status = source.status
    )
  ) then
    raise exception 'member_availability migration verification failed';
  end if;

  if to_regclass('public.schedule_events') is not null and exists (
    select 1
    from public.schedule_events as source
    where not exists (
      select 1
      from public.class_schedule as destination
      where destination.id = source.id::text
        and destination.title = source.title
        and destination.available_date = source.event_date
    )
  ) then
    raise exception 'schedule_events migration verification failed';
  end if;

  if to_regclass('public.portal_settings') is not null and exists (
    select 1
    from public.portal_settings
    where not login_enabled or not editing_enabled
  ) then
    raise exception 'portal_settings contains a closed setting that cannot be discarded safely';
  end if;
end;
$$;

drop trigger if exists sync_private_member_schedule on public.member_availability;
drop trigger if exists sync_private_member_profile on public.portal_members;
drop function if exists private.sync_member_availability();
drop function if exists private.sync_portal_member_profile();

drop table if exists public.schedule_events;
drop table if exists public.member_availability;
drop table if exists public.portal_members;
drop table if exists public.portal_settings;

comment on table public.member_schedule is
  'Canonical Discord member profiles and per-date availability. Password values are bcrypt hashes and are not granted to browser roles.';
comment on table public.class_schedule is
  'Canonical class credentials and shared schedule events. Credential rows have title null and are hidden from browser roles.';

commit;
