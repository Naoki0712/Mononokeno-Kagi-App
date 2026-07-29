alter table public.member_schedule
  add column if not exists "group" text;

alter table public.member_schedule
  drop constraint if exists member_schedule_group_check;

alter table public.member_schedule
  add constraint member_schedule_group_check
  check ("group" is null or "group" in (
    'Class-leader', 'Layout', 'Gimmick', 'Decoration', 'Gadget', 'Story'
  ));

update public.member_schedule
set "group" = case
  when id in ('2210', '2211') then 'Class-leader'
  when id = '2216' then 'Layout'
  when id = '2217' then 'Gimmick'
  when id = '2218' then 'Decoration'
  when id = '2221' then 'Gadget'
  when id in ('2202', '2204', '2215', '2223') then 'Story'
  else null
end;

create index if not exists member_schedule_date_group_idx
  on public.member_schedule (available_date, "group", id);

create or replace function public.classmate_member_calendar(p_token text)
returns table (
  id text,
  available_date date,
  status text,
  group_name text,
  is_self boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with current_classmate as (
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
    schedule.id,
    schedule.available_date,
    schedule.status,
    schedule."group" as group_name,
    schedule.id = current_classmate.student_id as is_self
  from current_classmate
  cross join public.member_schedule as schedule
  order by schedule.available_date, schedule."group" nulls last, schedule.id;
$$;

revoke execute on function public.classmate_member_calendar(text)
  from public, authenticated;
grant execute on function public.classmate_member_calendar(text)
  to anon;
