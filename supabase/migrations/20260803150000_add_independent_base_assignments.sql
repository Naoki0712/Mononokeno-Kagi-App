alter table public.member_schedule
  add column if not exists base text;

alter table public.member_schedule
  drop constraint if exists member_schedule_base_check;

alter table public.member_schedule
  add constraint member_schedule_base_check
  check (base is null or base in ('Signboard', 'Yokai', 'PR'));

create or replace function public.member_schedule_base_for_id(p_id text)
returns text
language sql
immutable
set search_path = ''
as $function$
  select case
    when p_id = any (array['2203','2210','2211','2220','2222','2226']) then 'PR'
    when p_id = any (array['2207','2213','2219','2225','2230']) then 'Signboard'
    when p_id = any (array[
      '2201','2202','2204','2205','2206','2208','2209','2212','2214','2215',
      '2216','2217','2218','2221','2223','2224','2227','2228','2229','2231',
      '2232','2233'
    ]) then 'Yokai'
    else null
  end;
$function$;

create or replace function public.set_member_schedule_base()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.base := public.member_schedule_base_for_id(new.id);
  return new;
end;
$function$;

drop trigger if exists set_member_schedule_base_before_write
  on public.member_schedule;

create trigger set_member_schedule_base_before_write
before insert or update of id
on public.member_schedule
for each row
execute function public.set_member_schedule_base();

update public.member_schedule
set base = public.member_schedule_base_for_id(id)
where base is distinct from public.member_schedule_base_for_id(id);

drop function if exists public.classmate_member_calendar(text);

create function public.classmate_member_calendar(p_token text)
returns table(
  id text,
  available_date date,
  status text,
  group_name text,
  base_name text,
  is_self boolean
)
language sql
stable
security definer
set search_path = ''
as $function$
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
    schedule.base as base_name,
    schedule.id = current_classmate.student_id as is_self
  from current_classmate
  cross join public.member_schedule as schedule
  order by schedule.available_date, schedule."group" nulls last, schedule.base nulls last, schedule.id;
$function$;

revoke all on function public.classmate_member_calendar(text) from public;
grant execute on function public.classmate_member_calendar(text) to anon, authenticated;
