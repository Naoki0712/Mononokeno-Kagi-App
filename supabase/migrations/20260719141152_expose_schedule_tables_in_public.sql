
create table if not exists public.member_schedule (
  id text not null check (id ~ '^[0-9]{4}$'),
  password text not null check (password like '$2%'),
  user_id uuid,
  display_name text not null default 'クラスメイト',
  discord_id text,
  available_date date,
  status text,
  updated_at timestamptz not null default now(),
  constraint member_schedule_availability_pair_check check (
    (available_date is null and status is null)
    or (available_date is not null and status in ('available', 'unavailable'))
  )
);

create unique index if not exists member_schedule_id_date_key
  on public.member_schedule (id, available_date) nulls not distinct;

create unique index if not exists member_schedule_profile_user_key
  on public.member_schedule (user_id)
  where available_date is null and user_id is not null;

create index if not exists member_schedule_user_date_idx
  on public.member_schedule (user_id, available_date);

create table if not exists public.class_schedule (
  id text not null check (id ~ '^[0-9]{4}$'),
  password text not null check (password like '$2%'),
  available_date date,
  available_time time without time zone,
  updated_at timestamptz not null default now(),
  constraint class_schedule_time_pair_check check (
    available_date is not null or available_time is null
  )
);

create unique index if not exists class_schedule_id_date_time_key
  on public.class_schedule (id, available_date, available_time) nulls not distinct;

create index if not exists class_schedule_available_at_idx
  on public.class_schedule (available_date, available_time);

comment on table public.member_schedule is
  'Dashboard-visible mirror of member profiles and availability. Password contains a bcrypt hash, never plaintext.';
comment on column public.member_schedule.password is
  'Bcrypt hash only. Do not enter a plaintext password in this column.';
comment on table public.class_schedule is
  'Dashboard-visible mirror of classmate credentials and optional availability. Password contains a bcrypt hash.';
comment on column public.class_schedule.password is
  'Bcrypt hash only. Use the admin password helper instead of storing plaintext.';

alter table public.member_schedule enable row level security;
alter table public.class_schedule enable row level security;

revoke all on table public.member_schedule from public, anon, authenticated;
revoke all on table public.class_schedule from public, anon, authenticated;

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
  id,
  password,
  user_id,
  display_name,
  discord_id,
  available_date,
  status,
  updated_at
from private.member_schedule
on conflict (id, available_date) do update
set password = excluded.password,
    user_id = excluded.user_id,
    display_name = excluded.display_name,
    discord_id = excluded.discord_id,
    status = excluded.status,
    updated_at = excluded.updated_at;

insert into public.class_schedule (
  id,
  password,
  available_date,
  available_time,
  updated_at
)
select
  id,
  password,
  available_date,
  available_time,
  updated_at
from private.class_schedule
on conflict (id, available_date, available_time) do update
set password = excluded.password,
    updated_at = excluded.updated_at;

create or replace function private.mirror_member_schedule_to_public()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.member_schedule
    where id = old.id
      and available_date is not distinct from old.available_date;
    return old;
  end if;

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
  values (
    new.id,
    new.password,
    new.user_id,
    new.display_name,
    new.discord_id,
    new.available_date,
    new.status,
    new.updated_at
  )
  on conflict (id, available_date) do update
  set password = excluded.password,
      user_id = excluded.user_id,
      display_name = excluded.display_name,
      discord_id = excluded.discord_id,
      status = excluded.status,
      updated_at = excluded.updated_at;

  return new;
end;
$$;

revoke all on function private.mirror_member_schedule_to_public()
  from public, anon, authenticated;

drop trigger if exists mirror_member_schedule_to_public on private.member_schedule;
create trigger mirror_member_schedule_to_public
after insert or update or delete on private.member_schedule
for each row execute function private.mirror_member_schedule_to_public();

create or replace function private.mirror_class_schedule_to_public()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.class_schedule
    where id = old.id
      and available_date is not distinct from old.available_date
      and available_time is not distinct from old.available_time;
    return old;
  end if;

  insert into public.class_schedule (
    id,
    password,
    available_date,
    available_time,
    updated_at
  )
  values (
    new.id,
    new.password,
    new.available_date,
    new.available_time,
    new.updated_at
  )
  on conflict (id, available_date, available_time) do update
  set password = excluded.password,
      updated_at = excluded.updated_at;

  return new;
end;
$$;

revoke all on function private.mirror_class_schedule_to_public()
  from public, anon, authenticated;

drop trigger if exists mirror_class_schedule_to_public on private.class_schedule;
create trigger mirror_class_schedule_to_public
after insert or update or delete on private.class_schedule
for each row execute function private.mirror_class_schedule_to_public();

notify pgrst, 'reload schema';
