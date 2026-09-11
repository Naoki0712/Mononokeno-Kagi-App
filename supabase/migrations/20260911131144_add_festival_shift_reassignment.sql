create table if not exists private.festival_shift_assignments (
  festival_day text not null check (festival_day in ('sat', 'sun')),
  slot smallint not null check (slot between 1 and 5),
  role text not null check (role in ('reception', 'staff', 'checkout')),
  position smallint not null,
  student_id text not null references private.classmate_accounts(student_id),
  updated_at timestamptz not null default now(),
  updated_by text references private.classmate_accounts(student_id),
  primary key (festival_day, slot, role, position),
  unique (festival_day, slot, student_id),
  check (
    (role = 'reception' and position between 1 and 2)
    or (role = 'staff' and position between 1 and 6)
    or (role = 'checkout' and position = 1)
  )
);

create table if not exists private.festival_shift_eligibility (
  festival_day text not null check (festival_day in ('sat', 'sun')),
  slot smallint not null check (slot between 1 and 5),
  student_id text not null references private.classmate_accounts(student_id),
  primary key (festival_day, slot, student_id)
);

create table if not exists private.festival_shift_changes (
  id bigint generated always as identity primary key,
  festival_day text not null,
  slot smallint not null,
  role text not null,
  position smallint not null,
  previous_student_id text not null,
  new_student_id text not null,
  changed_by text not null,
  changed_at timestamptz not null default now()
);

alter table private.festival_shift_assignments enable row level security;
alter table private.festival_shift_eligibility enable row level security;
alter table private.festival_shift_changes enable row level security;

create index if not exists festival_shift_assignments_student_id_idx
  on private.festival_shift_assignments (student_id);
create index if not exists festival_shift_assignments_updated_by_idx
  on private.festival_shift_assignments (updated_by);
create index if not exists festival_shift_eligibility_student_id_idx
  on private.festival_shift_eligibility (student_id);

revoke all on table private.festival_shift_assignments from public, anon, authenticated;
revoke all on table private.festival_shift_eligibility from public, anon, authenticated;
revoke all on table private.festival_shift_changes from public, anon, authenticated;
revoke all on all sequences in schema private from public, anon, authenticated;

with seed(festival_day, slot, role, student_ids) as (
  values
    ('sat', 1, 'reception', array['2205', '2212']),
    ('sat', 1, 'staff', array['2203', '2209', '2221', '2230', '2231', '2232']),
    ('sat', 1, 'checkout', array['2233']),
    ('sat', 2, 'reception', array['2206', '2228']),
    ('sat', 2, 'staff', array['2216', '2222', '2224', '2225', '2226', '2227']),
    ('sat', 2, 'checkout', array['2218']),
    ('sat', 3, 'reception', array['2207', '2231']),
    ('sat', 3, 'staff', array['2205', '2209', '2212', '2221', '2230', '2233']),
    ('sat', 3, 'checkout', array['2232']),
    ('sat', 4, 'reception', array['2214', '2231']),
    ('sat', 4, 'staff', array['2218', '2219', '2220', '2221', '2227', '2228']),
    ('sat', 4, 'checkout', array['2212']),
    ('sat', 5, 'reception', array['2213', '2230']),
    ('sat', 5, 'staff', array['2205', '2209', '2216', '2222', '2229', '2233']),
    ('sat', 5, 'checkout', array['2207']),
    ('sun', 1, 'reception', array['2208', '2226']),
    ('sun', 1, 'staff', array['2206', '2213', '2219', '2224', '2228', '2229']),
    ('sun', 1, 'checkout', array['2205']),
    ('sun', 2, 'reception', array['2218', '2227']),
    ('sun', 2, 'staff', array['2207', '2213', '2214', '2222', '2225', '2232']),
    ('sun', 2, 'checkout', array['2228']),
    ('sun', 3, 'reception', array['2216', '2219']),
    ('sun', 3, 'staff', array['2206', '2208', '2214', '2225', '2226', '2229']),
    ('sun', 3, 'checkout', array['2224']),
    ('sun', 4, 'reception', array['2222', '2233']),
    ('sun', 4, 'staff', array['2206', '2213', '2218', '2219', '2229', '2230']),
    ('sun', 4, 'checkout', array['2208']),
    ('sun', 5, 'reception', array['2224', '2225']),
    ('sun', 5, 'staff', array['2207', '2214', '2216', '2220', '2227', '2232']),
    ('sun', 5, 'checkout', array['2226'])
)
insert into private.festival_shift_assignments (
  festival_day,
  slot,
  role,
  position,
  student_id
)
select
  seed.festival_day,
  seed.slot,
  seed.role,
  student.ordinality::smallint,
  student.student_id
from seed
cross join lateral unnest(seed.student_ids) with ordinality as student(student_id, ordinality)
on conflict (festival_day, slot, role, position) do nothing;

insert into private.festival_shift_eligibility (festival_day, slot, student_id)
select day_name.festival_day, slot_number.slot, account.student_id
from (values ('sat'), ('sun')) as day_name(festival_day)
cross join generate_series(1, 5) as slot_number(slot)
join private.classmate_accounts as account
  on account.enabled
 and account.student_id between '2203' and '2233'
 and account.student_id not in ('2204', '2210', '2211', '2215', '2217', '2223')
where not (
  (day_name.festival_day = 'sat' and (
    account.student_id = '2208'
    or (account.student_id = '2214' and slot_number.slot between 1 and 3)
    or (account.student_id in ('2216', '2220', '2222', '2230', '2233') and slot_number.slot = 4)
    or (account.student_id = '2232' and slot_number.slot between 4 and 5)
  ))
  or
  (day_name.festival_day = 'sun' and (
    account.student_id in ('2209', '2212', '2221')
    or (account.student_id = '2205' and slot_number.slot between 2 and 5)
    or (account.student_id = '2208' and slot_number.slot in (2, 5))
    or (account.student_id = '2216' and slot_number.slot in (1, 2))
    or (account.student_id = '2220' and slot_number.slot between 1 and 4)
    or (account.student_id = '2222' and slot_number.slot = 5)
    or (account.student_id = '2228' and slot_number.slot = 3)
    or (account.student_id = '2230' and slot_number.slot in (1, 2, 3, 5))
    or (account.student_id = '2233' and slot_number.slot between 1 and 3)
  ))
)
on conflict do nothing;

create or replace function public.festival_shift_snapshot(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_student_id text;
  v_assignments jsonb;
begin
  select session.student_id
    into v_student_id
  from private.classmate_sessions as session
  join private.classmate_accounts as account
    on account.student_id = session.student_id
   and account.enabled
  where char_length(p_token) = 64
    and session.token_hash = extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
    and session.expires_at > now()
  limit 1;

  if v_student_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_session');
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'day', assignment.festival_day,
        'slot', assignment.slot,
        'role', assignment.role,
        'position', assignment.position,
        'student_id', assignment.student_id
      )
      order by assignment.festival_day, assignment.slot, assignment.role, assignment.position
    ),
    '[]'::jsonb
  )
    into v_assignments
  from private.festival_shift_assignments as assignment;

  return jsonb_build_object(
    'ok', true,
    'can_edit', v_student_id in ('2210', '2211'),
    'assignments', v_assignments
  );
end;
$function$;

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

  if p_day not in ('sat', 'sun') or p_slot not between 1 and 5 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_slot');
  end if;

  select coalesce(jsonb_agg(candidate.student_id order by candidate.assignment_count, candidate.student_id), '[]'::jsonb)
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
    or p_slot not between 1 and 5
    or p_role not in ('reception', 'staff', 'checkout')
    or p_position < 1
    or (p_role = 'reception' and p_position > 2)
    or (p_role = 'staff' and p_position > 6)
    or (p_role = 'checkout' and p_position <> 1)
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

revoke all on function public.festival_shift_snapshot(text) from public, authenticated;
revoke all on function public.festival_shift_candidates(text, text, smallint) from public, authenticated;
revoke all on function public.festival_shift_reassign(text, text, smallint, text, smallint, text) from public, authenticated;

grant execute on function public.festival_shift_snapshot(text) to anon;
grant execute on function public.festival_shift_candidates(text, text, smallint) to anon;
grant execute on function public.festival_shift_reassign(text, text, smallint, text, smallint, text) to anon;
