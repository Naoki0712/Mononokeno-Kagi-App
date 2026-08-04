create or replace function public.record_scanned_attendance(
  p_leader_token text,
  p_qr_code text,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_leader_id text;
  v_student_id text;
  v_qr_token text;
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
begin
  select session.student_id into v_leader_id
  from private.classmate_sessions session
  join private.classmate_accounts account on account.student_id = session.student_id and account.enabled
  where char_length(p_leader_token) = 64
    and session.token_hash = extensions.digest(convert_to(p_leader_token, 'UTF8'), 'sha256')
    and session.expires_at > now()
  limit 1;
  if v_leader_id not in ('2200', '2210', '2211', '2234', '2235', '2236') then
    raise exception 'leader access required';
  end if;
  if p_status not in ('arrived', 'left') then raise exception 'invalid status'; end if;
  if p_qr_code not like 'mononoke-attendance:v1:%' then raise exception 'invalid qr code'; end if;

  v_qr_token := substring(p_qr_code from 24);
  select qr.student_id into v_student_id
  from private.classmate_qr_tokens qr
  join private.classmate_accounts account on account.student_id = qr.student_id and account.enabled
  where qr.token_hash = extensions.digest(convert_to(v_qr_token, 'UTF8'), 'sha256')
  limit 1;
  if v_student_id is null then raise exception 'invalid qr code'; end if;

  insert into private.daily_attendance(attendance_date, student_id, status, updated_at)
  values (v_today, v_student_id, p_status, now())
  on conflict (attendance_date, student_id) do update
    set status = excluded.status, updated_at = excluded.updated_at;

  return jsonb_build_object('ok', true, 'student_id', v_student_id, 'status', p_status);
end;
$function$;

revoke all on function public.record_scanned_attendance(text, text, text) from public;
grant execute on function public.record_scanned_attendance(text, text, text) to anon, authenticated;
