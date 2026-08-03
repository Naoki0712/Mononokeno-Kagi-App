create or replace function public.advance_classmate_attendance(
  p_token text,
  p_date date
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_student_id text;
  v_current_status text;
  v_next_status text;
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

  if p_date is distinct from (now() at time zone 'Asia/Tokyo')::date then
    raise exception 'attendance can only be updated for today';
  end if;

  select attendance.status
    into v_current_status
  from private.daily_attendance as attendance
  where attendance.attendance_date = p_date
    and attendance.student_id = v_student_id
  for update;

  if v_current_status = 'left' then
    delete from private.daily_attendance
    where attendance_date = p_date
      and student_id = v_student_id;
    return null;
  end if;

  v_next_status := case
    when v_current_status is null then 'arrived'
    else 'left'
  end;

  insert into private.daily_attendance (
    attendance_date,
    student_id,
    status,
    updated_at
  )
  values (
    p_date,
    v_student_id,
    v_next_status,
    now()
  )
  on conflict (attendance_date, student_id) do update
  set status = excluded.status,
      updated_at = excluded.updated_at;

  return v_next_status;
end;
$function$;

revoke all on function public.advance_classmate_attendance(text, date) from public;
grant execute on function public.advance_classmate_attendance(text, date) to anon, authenticated;
