create or replace function public.set_classmate_availability(
  p_token text,
  p_date date,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
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

  if exists (
    select 1
    from public.member_schedule as membership
    where membership.id = v_student_id
      and membership."group" is not null
  ) then
    raise exception 'assigned members cannot edit availability';
  end if;

  if p_date < date '2026-08-18'
    or p_date > date '2026-08-31'
    or extract(isodow from p_date) not between 1 and 5 then
    raise exception 'date is closed';
  end if;

  if p_status is null then
    delete from public.member_schedule
    where id = v_student_id
      and available_date = p_date;
  elsif p_status in ('available', 'unavailable') then
    insert into public.member_schedule (id, available_date, status)
    values (v_student_id, p_date, p_status)
    on conflict (id, available_date) do update
    set status = excluded.status,
        updated_at = now();
  else
    raise exception 'invalid availability status';
  end if;
end;
$function$;
