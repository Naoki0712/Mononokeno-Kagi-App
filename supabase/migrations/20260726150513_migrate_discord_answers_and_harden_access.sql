-- Move the final Discord availability responses to classmate ID 2210,
-- remove the obsolete Discord/Supabase Auth data path, and harden access.

-- New public objects must be explicitly exposed.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete, truncate, references, trigger
  on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke usage, select, update on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

alter default privileges for role postgres in schema private
  revoke select, insert, update, delete, truncate, references, trigger
  on tables from public, anon, authenticated;
alter default privileges for role postgres in schema private
  revoke usage, select, update on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema private
  revoke execute on functions from public, anon, authenticated;

-- Production has one Discord respondent with 15 answers. A clean preview
-- database can legitimately have zero, so both states are supported.
do $$
declare
  v_discord_rows integer;
  v_discord_users integer;
begin
  if not exists (
    select 1
    from private.classmate_accounts
    where student_id = '2210' and enabled
  ) then
    raise exception 'Target classmate account 2210 is missing or disabled.';
  end if;

  select count(*), count(distinct user_id)
    into v_discord_rows, v_discord_users
  from public.member_availability
  where user_id is not null;

  if v_discord_rows not in (0, 15) then
    raise exception 'Expected zero or 15 Discord availability rows, found %.',
      v_discord_rows;
  end if;

  if v_discord_rows = 15 and v_discord_users <> 1 then
    raise exception 'Discord availability rows do not belong to one user.';
  end if;

  if v_discord_rows = 15 then
    insert into public.member_availability (
      classmate_id,
      available_date,
      availability_status,
      updated_at
    )
    select
      '2210',
      available_date,
      availability_status,
      updated_at
    from public.member_availability
    where user_id is not null
    on conflict (classmate_id, available_date) do update
    set availability_status = case
          when excluded.updated_at > public.member_availability.updated_at
            then excluded.availability_status
          else public.member_availability.availability_status
        end,
        updated_at = greatest(
          excluded.updated_at,
          public.member_availability.updated_at
        );

    delete from public.member_availability
    where user_id is not null;
  end if;

  if exists (
    select 1 from public.member_availability where user_id is not null
  ) then
    raise exception 'Discord availability migration did not finish.';
  end if;
end;
$$;

-- Remove every old direct-access policy before removing its helper functions.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'member_approvals',
        'member_availability',
        'member_schedule',
        'class_schedule'
      )
  loop
    execute format(
      'drop policy %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end;
$$;

-- Stop legacy triggers before replacing their source tables.
drop trigger if exists sync_classmate_account_to_public
  on private.class_schedule;
drop trigger if exists sync_member_password_to_public
  on private.member_schedule;
drop trigger if exists member_schedule_touch
  on public.member_schedule;
drop trigger if exists class_schedule_touch
  on public.class_schedule;

drop function if exists private.sync_classmate_account_to_public();
drop function if exists private.sync_member_password_to_public();
drop function if exists private.touch_member_schedule();
drop function if exists private.touch_class_schedule();
drop function if exists private.is_approved_member(uuid);
drop function if exists private.is_portal_admin();
drop function if exists public.touch_member_availability();
drop function if exists public.touch_schedule_event();

-- RPCs referring to tables that will be replaced are recreated below.
drop function if exists public.classmate_availability(text);
drop function if exists public.set_classmate_availability(text, date, text);
drop function if exists public.classmate_schedule(text);

-- Passwords are stored only in private.classmate_accounts.
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
    raise exception
      'Password must contain exactly eight digits or uppercase English letters.';
  end if;

  v_hash := extensions.crypt(
    p_password,
    extensions.gen_salt('bf', 12)
  );

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

  delete from private.classmate_sessions
  where student_id = v_id;
end;
$$;

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
  v_enabled boolean;
  v_blocked_until timestamptz;
  v_password_valid boolean := false;
  v_token text;
begin
  if v_student_id !~ '^[0-9]{4}$'
    or p_password is null
    or p_password !~ '^[0-9A-Z]{8}$' then
    return jsonb_build_object(
      'ok', false,
      'message', 'IDまたはパスワードが正しくありません。'
    );
  end if;

  select attempts.blocked_until
    into v_blocked_until
  from private.classmate_login_attempts as attempts
  where attempts.student_id = v_student_id
  for update;

  if v_blocked_until is not null and v_blocked_until > now() then
    return jsonb_build_object(
      'ok', false,
      'message', 'しばらく時間を空けてから、もう一度お試しください。'
    );
  end if;

  select account.password_hash, account.enabled
    into v_password_hash, v_enabled
  from private.classmate_accounts as account
  where account.student_id = v_student_id;

  if v_password_hash is not null and v_enabled then
    v_password_valid :=
      extensions.crypt(p_password, v_password_hash) = v_password_hash;
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

    return jsonb_build_object(
      'ok', false,
      'message', 'IDまたはパスワードが正しくありません。'
    );
  end if;

  delete from private.classmate_login_attempts
  where student_id = v_student_id;

  delete from private.classmate_sessions
  where expires_at <= now();

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into private.classmate_sessions (
    token_hash,
    student_id,
    expires_at
  )
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
      join private.classmate_accounts as account
        on account.student_id = session.student_id
       and account.enabled
      where char_length(p_token) = 64
        and session.token_hash =
          extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
        and session.expires_at > now()
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
    and token_hash =
      extensions.digest(convert_to(p_token, 'UTF8'), 'sha256');
$$;

-- Confirm that legacy password mirrors match the private account source
-- before deleting them.
do $$
begin
  if exists (
    select 1
    from private.class_schedule as legacy
    where legacy.available_date is not null
       or legacy.available_time is not null
       or not exists (
         select 1
         from private.classmate_accounts as account
         where account.student_id = legacy.id
           and account.password_hash = legacy.password
       )
  ) then
    raise exception 'private.class_schedule contains data not preserved in classmate_accounts.';
  end if;

  if exists (
    select 1
    from private.member_schedule
    where user_id is null and discord_id is null
  ) then
    raise exception 'private.member_schedule contains non-Discord data.';
  end if;
end;
$$;

drop table private.member_schedule;
drop table private.class_schedule;

-- Create clean public tables. No password, Discord ID, or Supabase Auth UUID
-- is copied into the public schema.
create table public.member_schedule_new (
  id text not null
    references private.classmate_accounts(student_id) on delete cascade
    check (id ~ '^[0-9]{4}$'),
  available_date date not null,
  status text not null
    check (status in ('available', 'unavailable')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, available_date),
  constraint member_schedule_open_date_check
    check (
      extract(isodow from available_date) between 1 and 5
      and available_date not between date '2026-08-10' and date '2026-08-17'
    )
);

insert into public.member_schedule_new (
  id,
  available_date,
  status,
  created_at,
  updated_at
)
select
  classmate_id,
  available_date,
  availability_status,
  updated_at,
  updated_at
from public.member_availability
where classmate_id is not null;

create table public.class_schedule_new (
  id text primary key default (gen_random_uuid())::text
    check (
      id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ),
  title text not null
    check (
      char_length(btrim(title)) between 1 and 100
    ),
  available_date date not null,
  available_time time without time zone,
  end_time time without time zone,
  assignee text not null default ''
    check (char_length(assignee) <= 120),
  team text not null default ''
    check (char_length(team) <= 80),
  location text not null default ''
    check (char_length(location) <= 120),
  description text not null default ''
    check (char_length(description) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_schedule_time_order
    check (
      available_time is null
      or end_time is null
      or end_time >= available_time
    )
);

insert into public.class_schedule_new (
  id,
  title,
  available_date,
  available_time,
  end_time,
  assignee,
  team,
  location,
  description,
  created_at,
  updated_at
)
select
  id,
  title,
  available_date,
  available_time,
  end_time,
  assignee,
  team,
  location,
  description,
  created_at,
  updated_at
from public.class_schedule
where title is not null;

create index class_schedule_new_available_at_idx
  on public.class_schedule_new (available_date, available_time);

-- The legacy public.member_schedule contains only the old Discord copy.
do $$
begin
  if exists (
    select 1
    from public.member_schedule
    where user_id is null and discord_id is null
  ) then
    raise exception 'public.member_schedule contains non-Discord legacy data.';
  end if;
end;
$$;

drop table if exists public.member_approvals;
drop table public.member_schedule;
drop table public.member_availability;
drop table public.class_schedule;

alter table public.member_schedule_new rename to member_schedule;
alter table public.member_schedule
  rename constraint member_schedule_new_pkey to member_schedule_pkey;

alter table public.class_schedule_new rename to class_schedule;
alter table public.class_schedule
  rename constraint class_schedule_new_pkey to class_schedule_pkey;
alter index public.class_schedule_new_available_at_idx
  rename to class_schedule_available_at_idx;

create or replace function public.classmate_availability(p_token text)
returns table (
  available_date date,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select answer.available_date, answer.status
  from public.member_schedule as answer
  join private.classmate_sessions as session
    on session.student_id = answer.id
  join private.classmate_accounts as account
    on account.student_id = session.student_id
   and account.enabled
  where char_length(p_token) = 64
    and session.token_hash =
      extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
    and session.expires_at > now()
  order by answer.available_date;
$$;

create or replace function public.set_classmate_availability(
  p_token text,
  p_date date,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id text;
begin
  select session.student_id
    into v_student_id
  from private.classmate_sessions as session
  join private.classmate_accounts as account
    on account.student_id = session.student_id
   and account.enabled
  where char_length(p_token) = 64
    and session.token_hash =
      extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
    and session.expires_at > now()
  limit 1;

  if v_student_id is null then
    raise exception 'invalid session';
  end if;

  if extract(isodow from p_date) not between 1 and 5
    or p_date between date '2026-08-10' and date '2026-08-17' then
    raise exception 'date is closed';
  end if;

  if p_status is null then
    delete from public.member_schedule
    where id = v_student_id
      and available_date = p_date;
  elsif p_status in ('available', 'unavailable') then
    insert into public.member_schedule (
      id,
      available_date,
      status
    )
    values (
      v_student_id,
      p_date,
      p_status
    )
    on conflict (id, available_date) do update
    set status = excluded.status,
        updated_at = now();
  else
    raise exception 'invalid availability status';
  end if;
end;
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
  with current_session as (
    select session.student_id
    from private.classmate_sessions as session
    join private.classmate_accounts as account
      on account.student_id = session.student_id
     and account.enabled
    where char_length(p_token) = 64
      and session.token_hash =
        extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
      and session.expires_at > now()
    limit 1
  )
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
  cross join current_session
  where (
    current_session.student_id in ('2200', '2234', '2235', '2236')
    or coalesce(event.assignee, '') !~ '(^|[^0-9])[0-9]{4}([^0-9]|$)'
    or event.assignee ~ (
      '(^|[^0-9])'
      || current_session.student_id
      || '([^0-9]|$)'
    )
  )
  order by
    event.available_date,
    event.available_time nulls last,
    event.title;
$$;

comment on table public.member_schedule is
  'Per-date availability stored only by four-digit classmate ID.';
comment on table public.class_schedule is
  'Shared class schedule events. Credentials are stored only in private.classmate_accounts.';
comment on function public.classmate_schedule(text) is
  'Returns common and own assigned schedule items; IDs 2200 and 2234-2236 may view all assignments.';

-- RLS is defense in depth. Browser clients cannot access any table directly;
-- only the six token-validating RPCs below are exposed.
alter table private.classmate_accounts enable row level security;
alter table private.classmate_sessions enable row level security;
alter table private.classmate_login_attempts enable row level security;
alter table public.member_schedule enable row level security;
alter table public.class_schedule enable row level security;

revoke all on all tables in schema private
  from public, anon, authenticated;
revoke all on all sequences in schema private
  from public, anon, authenticated;
revoke execute on all functions in schema private
  from public, anon, authenticated;
revoke usage, create on schema private
  from public, anon, authenticated;

revoke all on table public.member_schedule
  from public, anon, authenticated;
revoke all on table public.class_schedule
  from public, anon, authenticated;

revoke execute on all functions in schema public
  from public, anon, authenticated;

grant execute on function public.classmate_login(text, text)
  to anon, authenticated;
grant execute on function public.classmate_session(text)
  to anon, authenticated;
grant execute on function public.classmate_logout(text)
  to anon, authenticated;
grant execute on function public.classmate_schedule(text)
  to anon, authenticated;
grant execute on function public.classmate_availability(text)
  to anon, authenticated;
grant execute on function public.set_classmate_availability(text, date, text)
  to anon, authenticated;

-- Refuse to finish if data or access did not reach the intended state.
do $$
declare
  v_2210_rows integer;
begin
  select count(*)
    into v_2210_rows
  from public.member_schedule
  where id = '2210';

  if v_2210_rows not in (0, 15) then
    raise exception 'ID 2210 must have zero preview rows or 15 production answers.';
  end if;

  if v_2210_rows = 15
    and (
      select count(*)
      from public.member_schedule
      where id = '2210' and status = 'available'
    ) <> 15 then
    raise exception 'ID 2210 migrated answers do not match the source.';
  end if;

  if exists (
    select 1
    from pg_class as relation
    join pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname in ('public', 'private')
      and relation.relkind in ('r', 'p')
      and not relation.relrowsecurity
  ) then
    raise exception 'RLS is still disabled on an application table.';
  end if;

  if has_schema_privilege('anon', 'private', 'USAGE')
    or has_schema_privilege('authenticated', 'private', 'USAGE') then
    raise exception 'Browser roles can still use the private schema.';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema in ('public', 'private')
      and grantee in ('anon', 'authenticated', 'PUBLIC')
  ) then
    raise exception 'Browser roles still have direct table privileges.';
  end if;
end;
$$;

notify pgrst, 'reload schema';
