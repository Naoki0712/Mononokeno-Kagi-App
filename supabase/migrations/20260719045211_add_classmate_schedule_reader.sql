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
    join private.classmate_accounts as account
      on account.student_id = session.student_id
    where session.token_hash = extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
      and session.expires_at > now()
      and account.enabled = true
  )
  order by event.event_date, event.start_time nulls last, event.title;
$$;

revoke all on function public.classmate_schedule(text) from public;
grant execute on function public.classmate_schedule(text) to anon, authenticated;

comment on function public.classmate_schedule(text) is
  'Returns the shared schedule only when supplied with a valid classmate session token.';
