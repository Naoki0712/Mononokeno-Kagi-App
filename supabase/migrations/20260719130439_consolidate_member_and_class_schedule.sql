-- Consolidated private schedule data. Password columns contain bcrypt hashes only.
create table if not exists private.member_schedule (
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
  on private.member_schedule (id, available_date) nulls not distinct;

create unique index if not exists member_schedule_profile_user_key
  on private.member_schedule (user_id)
  where available_date is null and user_id is not null;

create index if not exists member_schedule_user_date_idx
  on private.member_schedule (user_id, available_date);

create table if not exists private.class_schedule (
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
  on private.class_schedule (id, available_date, available_time) nulls not distinct;

create index if not exists class_schedule_available_at_idx
  on private.class_schedule (available_date, available_time);

comment on table private.member_schedule is
  'Member profiles and availability. The password column stores a bcrypt hash, never the original password.';
comment on column private.member_schedule.password is
  'Bcrypt password hash. Set through private.set_classmate_password; never store plaintext.';
comment on table private.class_schedule is
  'Classmate credentials and optional class schedule availability. The password column stores a bcrypt hash.';
comment on column private.class_schedule.password is
  'Bcrypt password hash. Set through private.set_classmate_password; never store plaintext.';

revoke all on table private.member_schedule from public, anon, authenticated;
revoke all on table private.class_schedule from public, anon, authenticated;

-- Preserve the existing placeholder account and credentials.
insert into private.class_schedule (id, password, available_date, available_time, updated_at)
select account.student_id, account.password_hash, null, null, account.updated_at
from private.classmate_accounts as account
where account.enabled = true
on conflict (id, available_date, available_time) do update
set password = excluded.password,
    updated_at = excluded.updated_at;

-- If this project still contains the original single placeholder account and
-- single Discord member, retain that relationship while moving the data.
with singleton_account as (
  select account.student_id, account.password_hash
  from private.classmate_accounts as account
  where account.enabled = true
    and (select count(*) from private.classmate_accounts where enabled = true) = 1
),
singleton_member as (
  select member.user_id, member.display_name, member.discord_id
  from public.portal_members as member
  where (select count(*) from public.portal_members) = 1
)
insert into private.member_schedule (
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
  account.student_id,
  account.password_hash,
  member.user_id,
  member.display_name,
  member.discord_id,
  null,
  null,
  now()
from singleton_account as account
cross join singleton_member as member
on conflict (id, available_date) do update
set password = excluded.password,
    user_id = excluded.user_id,
    display_name = excluded.display_name,
    discord_id = excluded.discord_id,
    updated_at = excluded.updated_at;

insert into private.member_schedule (
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
  availability.user_id,
  profile.display_name,
  profile.discord_id,
  availability.available_date,
  availability.status,
  availability.updated_at
from public.member_availability as availability
join private.member_schedule as profile
  on profile.user_id = availability.user_id
 and profile.available_date is null
on conflict (id, available_date) do update
set password = excluded.password,
    user_id = excluded.user_id,
    display_name = excluded.display_name,
    discord_id = excluded.discord_id,
    status = excluded.status,
    updated_at = excluded.updated_at;

create or replace function private.sync_member_availability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile private.member_schedule%rowtype;
begin
  if tg_op = 'DELETE' then
    delete from private.member_schedule
    where user_id = old.user_id
      and available_date = old.available_date;
    return old;
  end if;

  select profile.*
    into v_profile
  from private.member_schedule as profile
  where profile.user_id = new.user_id
    and profile.available_date is null
  limit 1;

  if v_profile.id is not null then
    insert into private.member_schedule (
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
      v_profile.id,
      v_profile.password,
      new.user_id,
      v_profile.display_name,
      v_profile.discord_id,
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
  end if;

  return new;
end;
$$;

revoke all on function private.sync_member_availability() from public, anon, authenticated;

drop trigger if exists sync_private_member_schedule on public.member_availability;
create trigger sync_private_member_schedule
after insert or update or delete on public.member_availability
for each row execute function private.sync_member_availability();

create or replace function private.sync_portal_member_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.member_schedule
  set display_name = new.display_name,
      discord_id = new.discord_id,
      updated_at = now()
  where user_id = new.user_id;
  return new;
end;
$$;

revoke all on function private.sync_portal_member_profile() from public, anon, authenticated;

drop trigger if exists sync_private_member_profile on public.portal_members;
create trigger sync_private_member_profile
after update of display_name, discord_id on public.portal_members
for each row execute function private.sync_portal_member_profile();

-- Admin-only helper. It validates the exact input format before hashing and
-- keeps the compatibility account in sync while the legacy tables remain.
create or replace function private.set_classmate_password(
  p_id text,
  p_password text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text := btrim(coalesce(p_id, ''));
  v_hash text;
begin
  if v_id !~ '^[0-9]{4}$' then
    raise exception 'ID must contain exactly four digits.';
  end if;

  if p_password is null or p_password !~ '^[0-9A-Z]{8}$' then
    raise exception 'Password must contain exactly eight digits or uppercase English letters.';
  end if;

  v_hash := extensions.crypt(p_password, extensions.gen_salt('bf', 12));

  insert into private.classmate_accounts (
    student_id,
    password_hash,
    enabled,
    created_at,
    updated_at
  )
  values (v_id, v_hash, true, now(), now())
  on conflict (student_id) do update
  set password_hash = excluded.password_hash,
      enabled = true,
      updated_at = now();

  insert into private.class_schedule (id, password, available_date, available_time, updated_at)
  values (v_id, v_hash, null, null, now())
  on conflict (id, available_date, available_time) do update
  set password = excluded.password,
      updated_at = excluded.updated_at;

  update private.member_schedule
  set password = v_hash,
      updated_at = now()
  where id = v_id;

  delete from private.classmate_sessions
  where student_id = v_id;
end;
$$;

revoke all on function private.set_classmate_password(text, text) from public, anon, authenticated;

create or replace function public.classmate_login(
  p_student_id text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id text := btrim(coalesce(p_student_id, ''));
  v_password_hash text;
  v_blocked_until timestamptz;
  v_password_valid boolean := false;
  v_token text;
begin
  if v_student_id !~ '^[0-9]{4}$'
    or p_password is null
    or p_password !~ '^[0-9A-Z]{8}$' then
    return jsonb_build_object('ok', false, 'message', 'IDまたはパスワードが正しくありません。');
  end if;

  select attempts.blocked_until
    into v_blocked_until
  from private.classmate_login_attempts as attempts
  where attempts.student_id = v_student_id
  for update;

  if v_blocked_until is not null and v_blocked_until > now() then
    return jsonb_build_object('ok', false, 'message', 'しばらく時間を空けてから、もう一度お試しください。');
  end if;

  select schedule.password
    into v_password_hash
  from private.class_schedule as schedule
  where schedule.id = v_student_id
    and schedule.available_date is null
    and schedule.available_time is null
  limit 1;

  if v_password_hash is not null then
    v_password_valid := extensions.crypt(p_password, v_password_hash) = v_password_hash;
  end if;

  if not v_password_valid then
    insert into private.classmate_login_attempts as attempts (
      student_id,
      failure_count,
      window_started_at,
      blocked_until
    )
    values (v_student_id, 1, now(), null)
    on conflict (student_id) do update
    set failure_count = case
          when attempts.window_started_at < now() - interval '15 minutes' then 1
          else attempts.failure_count + 1
        end,
        window_started_at = case
          when attempts.window_started_at < now() - interval '15 minutes' then now()
          else attempts.window_started_at
        end,
        blocked_until = case
          when attempts.window_started_at >= now() - interval '15 minutes'
            and attempts.failure_count + 1 >= 5
          then now() + interval '15 minutes'
          else null
        end;

    return jsonb_build_object('ok', false, 'message', 'IDまたはパスワードが正しくありません。');
  end if;

  delete from private.classmate_login_attempts
  where student_id = v_student_id;

  delete from private.classmate_sessions
  where expires_at <= now();

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into private.classmate_sessions (token_hash, student_id, expires_at)
  values (
    extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'),
    v_student_id,
    now() + interval '12 hours'
  );

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'student_id', v_student_id,
    'expires_in', 43200
  );
end;
$$;

create or replace function public.classmate_session(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'ok', true,
        'student_id', session.student_id,
        'expires_at', session.expires_at
      )
      from private.classmate_sessions as session
      where char_length(p_token) = 64
        and session.token_hash = extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
        and session.expires_at > now()
        and exists (
          select 1
          from private.class_schedule as schedule
          where schedule.id = session.student_id
            and schedule.available_date is null
            and schedule.available_time is null
        )
      limit 1
    ),
    jsonb_build_object('ok', false)
  );
$$;

create or replace function public.classmate_logout(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.classmate_sessions
  where char_length(p_token) = 64
    and token_hash = extensions.digest(convert_to(p_token, 'UTF8'), 'sha256');
$$;

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
    event.id,
    event.title,
    event.event_date,
    event.start_time,
    event.end_time,
    event.assignee,
    event.team,
    event.location,
    event.description
  from public.schedule_events as event
  where char_length(p_token) = 64
    and exists (
      select 1
      from private.classmate_sessions as session
      where session.token_hash = extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
        and session.expires_at > now()
        and exists (
          select 1
          from private.class_schedule as schedule
          where schedule.id = session.student_id
            and schedule.available_date is null
            and schedule.available_time is null
        )
    )
  order by event.event_date, event.start_time nulls last, event.title;
$$;

revoke all on function public.classmate_login(text, text) from public;
revoke all on function public.classmate_session(text) from public;
revoke all on function public.classmate_logout(text) from public;
revoke all on function public.classmate_schedule(text) from public;

grant execute on function public.classmate_login(text, text) to anon, authenticated;
grant execute on function public.classmate_session(text) to anon, authenticated;
grant execute on function public.classmate_logout(text) to anon, authenticated;
grant execute on function public.classmate_schedule(text) to anon, authenticated;

comment on function public.classmate_login(text, text) is
  'Authenticates a four-digit classmate ID with an individual eight-character uppercase/digit password.';
comment on function private.set_classmate_password(text, text) is
  'Admin-only password setter that validates eight uppercase/digit characters and stores bcrypt hashes.';
