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
    where char_length(p_token) = 64
      and session.token_hash = extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
      and session.expires_at > now()
      and exists (
        select 1
        from private.class_schedule as credential
        where credential.id = session.student_id
          and credential.available_date is null
          and credential.available_time is null
      )
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
  where event.title is not null
    and (
      current_session.student_id in ('2200', '2234', '2235', '2236')
      or coalesce(event.assignee, '') !~ '(^|[^0-9])[0-9]{4}([^0-9]|$)'
      or event.assignee ~ ('(^|[^0-9])' || current_session.student_id || '([^0-9]|$)')
    )
  order by event.available_date, event.available_time nulls last, event.title;
$$;

revoke all on function public.classmate_schedule(text) from public;
grant execute on function public.classmate_schedule(text) to anon, authenticated;

comment on function public.classmate_schedule(text) is
  'Returns common and own assigned schedule items; IDs 2200 and 2234-2236 may view all member assignments.';
