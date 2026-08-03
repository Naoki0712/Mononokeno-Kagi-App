create table if not exists private.daily_attendance (
  attendance_date date not null,
  student_id text not null,
  status text not null check (status in ('arrived', 'left')),
  updated_at timestamptz not null default now(),
  primary key (attendance_date, student_id),
  constraint daily_attendance_student_id_format check (student_id ~ '^[0-9]{4}$')
);

alter table private.daily_attendance enable row level security;

create or replace function public.classmate_attendance(p_token text)
returns table(attendance_date date, student_id text, status text)
language sql stable security definer set search_path = ''
as $function$
  select attendance.attendance_date, attendance.student_id, attendance.status
  from private.daily_attendance as attendance
  where exists (
    select 1
    from private.classmate_sessions as session
    join private.classmate_accounts as account
      on account.student_id = session.student_id and account.enabled
    where char_length(p_token) = 64
      and session.token_hash = extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
      and session.expires_at > now()
  )
  order by attendance.attendance_date, attendance.student_id;
$function$;

create or replace function public.advance_classmate_attendance(p_token text, p_date date)
returns text
language plpgsql security definer set search_path = ''
as $function$
declare
  v_student_id text;
  v_current_status text;
  v_next_status text;
begin
  select session.student_id into v_student_id
  from private.classmate_sessions as session
  join private.classmate_accounts as account
    on account.student_id = session.student_id and account.enabled
  where char_length(p_token) = 64
    and session.token_hash = extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
    and session.expires_at > now()
  limit 1;

  if v_student_id is null then raise exception 'invalid session'; end if;
  if p_date is distinct from (now() at time zone 'Asia/Tokyo')::date then
    raise exception 'attendance can only be updated for today';
  end if;

  select attendance.status into v_current_status
  from private.daily_attendance as attendance
  where attendance.attendance_date = p_date and attendance.student_id = v_student_id
  for update;

  v_next_status := case
    when v_current_status is null then 'arrived'
    when v_current_status = 'arrived' then 'left'
    else 'left'
  end;

  insert into private.daily_attendance (attendance_date, student_id, status, updated_at)
  values (p_date, v_student_id, v_next_status, now())
  on conflict (attendance_date, student_id) do update
  set status = excluded.status, updated_at = excluded.updated_at;

  return v_next_status;
end;
$function$;

revoke all on function public.classmate_attendance(text) from public;
revoke all on function public.advance_classmate_attendance(text, date) from public;
grant execute on function public.classmate_attendance(text) to anon, authenticated;
grant execute on function public.advance_classmate_attendance(text, date) to anon, authenticated;
