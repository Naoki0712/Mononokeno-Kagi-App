begin;

alter table private.festival_shift_assignments
  drop constraint festival_shift_assignments_slot_check,
  drop constraint festival_shift_assignments_role_check,
  drop constraint festival_shift_assignments_check;

alter table private.festival_shift_assignments
  add constraint festival_shift_assignments_slot_check
    check (slot between 1 and 6),
  add constraint festival_shift_assignments_role_check
    check (role in ('reception', 'staff', 'checkout', 'backup')),
  add constraint festival_shift_assignments_check
    check (
      (role = 'reception' and position between 1 and 2)
      or (role = 'staff' and position between 1 and 6)
      or (role = 'checkout' and position = 1)
      or (role = 'backup' and position between 1 and 2)
    );

alter table private.festival_shift_eligibility
  drop constraint festival_shift_eligibility_slot_check;

alter table private.festival_shift_eligibility
  add constraint festival_shift_eligibility_slot_check
    check (slot between 1 and 6);

delete from private.festival_shift_assignments
where festival_day = 'sun';

with sunday_shift(slot, role, student_ids) as (
  values
    (1, 'reception', array['2205', '2206']),
    (1, 'staff', array['2207', '2214', '2219', '2222', '2224']),
    (1, 'checkout', array['2225']),
    (1, 'backup', array['2228', '2229']),
    (2, 'reception', array['2218', '2227']),
    (2, 'staff', array['2205', '2206', '2207', '2224', '2229']),
    (2, 'checkout', array['2228']),
    (2, 'backup', array['2225', '2226']),
    (3, 'reception', array['2208', '2216']),
    (3, 'staff', array['2207', '2213', '2218', '2219', '2225']),
    (3, 'checkout', array['2214']),
    (3, 'backup', array['2222', '2229']),
    (4, 'reception', array['2213', '2230']),
    (4, 'staff', array['2206', '2208', '2214', '2216', '2227']),
    (4, 'checkout', array['2219']),
    (4, 'backup', array['2207', '2222']),
    (5, 'reception', array['2224', '2233']),
    (5, 'staff', array['2206', '2213', '2218', '2225', '2230']),
    (5, 'checkout', array['2227']),
    (5, 'backup', array['2214', '2226']),
    (6, 'reception', array['2203', '2220']),
    (6, 'staff', array['2216', '2218', '2224', '2226', '2233']),
    (6, 'checkout', array['2229']),
    (6, 'backup', array['2219', '2228'])
)
insert into private.festival_shift_assignments (
  festival_day,
  slot,
  role,
  position,
  student_id,
  updated_at,
  updated_by
)
select
  'sun',
  sunday_shift.slot,
  sunday_shift.role,
  student.ordinality::smallint,
  student.student_id,
  now(),
  null
from sunday_shift
cross join lateral unnest(sunday_shift.student_ids)
  with ordinality as student(student_id, ordinality);

insert into private.festival_shift_eligibility (
  festival_day,
  slot,
  student_id
)
select 'sun', 6, assignment.student_id
from private.festival_shift_assignments as assignment
where assignment.festival_day = 'sun'
  and assignment.slot = 6
on conflict do nothing;

create or replace function public.festival_shift_candidates(
  p_token text,
  p_day text,
  p_slot smallint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_admin_id text;
  v_candidates jsonb;
begin
  select session.student_id
    into v_admin_id
  from private.classmate_sessions as session
  join private.classmate_accounts as account
    on account.student_id = session.student_id
   and account.enabled
  where char_length(p_token) = 64
    and session.token_hash = extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
    and session.expires_at > now()
    and session.student_id in ('2210', '2211')
  limit 1;

  if v_admin_id is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthorized');
  end if;

  if p_day not in ('sat', 'sun')
    or p_slot < 1
    or (p_day = 'sat' and p_slot > 4)
    or (p_day = 'sun' and p_slot > 6)
  then
    return jsonb_build_object('ok', false, 'reason', 'invalid_slot');
  end if;

  select coalesce(
    jsonb_agg(candidate.student_id order by candidate.assignment_count, candidate.student_id),
    '[]'::jsonb
  )
    into v_candidates
  from (
    select eligibility.student_id, count(all_assignments.student_id) as assignment_count
    from private.festival_shift_eligibility as eligibility
    left join private.festival_shift_assignments as all_assignments
      on all_assignments.student_id = eligibility.student_id
    where eligibility.festival_day = p_day
      and eligibility.slot = p_slot
      and not exists (
        select 1
        from private.festival_shift_assignments as same_slot
        where same_slot.festival_day = p_day
          and same_slot.slot = p_slot
          and same_slot.student_id = eligibility.student_id
      )
    group by eligibility.student_id
  ) as candidate;

  return jsonb_build_object('ok', true, 'candidates', v_candidates);
end;
$function$;

create or replace function public.festival_shift_reassign(
  p_token text,
  p_day text,
  p_slot smallint,
  p_role text,
  p_position smallint,
  p_new_student_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin_id text;
  v_previous_student_id text;
begin
  select session.student_id
    into v_admin_id
  from private.classmate_sessions as session
  join private.classmate_accounts as account
    on account.student_id = session.student_id
   and account.enabled
  where char_length(p_token) = 64
    and session.token_hash = extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
    and session.expires_at > now()
    and session.student_id in ('2210', '2211')
  limit 1;

  if v_admin_id is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthorized');
  end if;

  if p_day not in ('sat', 'sun')
    or p_slot < 1
    or (p_day = 'sat' and p_slot > 4)
    or (p_day = 'sun' and p_slot > 6)
    or p_role not in ('reception', 'staff', 'checkout', 'backup')
    or p_position < 1
    or (p_role = 'reception' and p_position > 2)
    or (p_role = 'staff' and p_position > 6)
    or (p_role = 'checkout' and p_position <> 1)
    or (p_role = 'backup' and p_position > 2)
  then
    return jsonb_build_object('ok', false, 'reason', 'invalid_assignment');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(9026, 3);

  select assignment.student_id
    into v_previous_student_id
  from private.festival_shift_assignments as assignment
  where assignment.festival_day = p_day
    and assignment.slot = p_slot
    and assignment.role = p_role
    and assignment.position = p_position
  for update;

  if v_previous_student_id is null then
    return jsonb_build_object('ok', false, 'reason', 'assignment_not_found');
  end if;

  if not exists (
    select 1
    from private.festival_shift_eligibility as eligibility
    where eligibility.festival_day = p_day
      and eligibility.slot = p_slot
      and eligibility.student_id = p_new_student_id
  ) then
    return jsonb_build_object('ok', false, 'reason', 'ineligible');
  end if;

  if exists (
    select 1
    from private.festival_shift_assignments as same_slot
    where same_slot.festival_day = p_day
      and same_slot.slot = p_slot
      and same_slot.student_id = p_new_student_id
  ) then
    return jsonb_build_object('ok', false, 'reason', 'already_assigned');
  end if;

  update private.festival_shift_assignments
  set student_id = p_new_student_id,
      updated_at = now(),
      updated_by = v_admin_id
  where festival_day = p_day
    and slot = p_slot
    and role = p_role
    and position = p_position;

  insert into private.festival_shift_changes (
    festival_day,
    slot,
    role,
    position,
    previous_student_id,
    new_student_id,
    changed_by
  ) values (
    p_day,
    p_slot,
    p_role,
    p_position,
    v_previous_student_id,
    p_new_student_id,
    v_admin_id
  );

  return jsonb_build_object(
    'ok', true,
    'previous_student_id', v_previous_student_id,
    'new_student_id', p_new_student_id
  );
end;
$function$;

revoke all on function public.festival_shift_candidates(text, text, smallint)
  from public, anon, authenticated;
revoke all on function public.festival_shift_reassign(text, text, smallint, text, smallint, text)
  from public, anon, authenticated;

grant execute on function public.festival_shift_candidates(text, text, smallint) to anon;
grant execute on function public.festival_shift_reassign(text, text, smallint, text, smallint, text) to anon;

commit;
