begin;

-- The Saturday programme now starts at 10:30, so the former 9:00 shift is
-- removed and the remaining Saturday slots move forward by one number.
create temporary table revised_festival_shift_assignments on commit drop as
select
  assignment.festival_day,
  case
    when assignment.festival_day = 'sat' then assignment.slot - 1
    else assignment.slot
  end::smallint as slot,
  assignment.role,
  assignment.position,
  case
    -- 2208 cannot cover the new Sunday 9:30-10:30 period because it overlaps
    -- their 10:00-11:00 unavailability. 2203 is otherwise eligible here.
    when assignment.festival_day = 'sun'
      and assignment.slot = 1
      and assignment.student_id = '2208'
      then '2203'
    else assignment.student_id
  end as student_id,
  now() as updated_at,
  null::text as updated_by
from private.festival_shift_assignments as assignment
where exists (
  select 1
  from private.festival_shift_assignments as current_schedule
  where current_schedule.festival_day = 'sat'
    and current_schedule.slot = 5
)
and not (
  assignment.festival_day = 'sat'
  and assignment.slot = 1
);

delete from private.festival_shift_assignments
where exists (select 1 from revised_festival_shift_assignments);

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
  festival_day,
  slot,
  role,
  position,
  student_id,
  updated_at,
  updated_by
from revised_festival_shift_assignments;

-- Rebuild candidate eligibility for the revised nominal periods:
-- Sat 10:30-11:15, 11:15-12:00, 13:00-14:00, 14:00-15:00
-- Sun 09:30-10:30, 10:30-11:15, 11:15-12:00, 13:00-14:00, 14:00-15:00
delete from private.festival_shift_eligibility;

insert into private.festival_shift_eligibility (festival_day, slot, student_id)
select day_slot.festival_day, day_slot.slot, account.student_id
from (
  select 'sat'::text as festival_day, generate_series(1, 4)::smallint as slot
  union all
  select 'sun'::text as festival_day, generate_series(1, 5)::smallint as slot
) as day_slot
join private.classmate_accounts as account
  on account.enabled
 and account.student_id between '2201' and '2233'
 and account.student_id not in (
   '2201', '2202', '2204', '2207', '2210', '2211', '2215', '2217', '2223'
 )
where not (
  (day_slot.festival_day = 'sat' and (
    account.student_id = '2208'
    or (account.student_id = '2214' and day_slot.slot in (1, 2))
    or (account.student_id in ('2216', '2220', '2222', '2230', '2233') and day_slot.slot = 3)
    or (account.student_id = '2232' and day_slot.slot in (3, 4))
  ))
  or
  (day_slot.festival_day = 'sun' and (
    account.student_id in ('2209', '2212', '2221')
    or (account.student_id = '2205' and day_slot.slot in (2, 3, 4, 5))
    or (account.student_id = '2208' and day_slot.slot in (1, 2, 5))
    or (account.student_id = '2216' and day_slot.slot = 1)
    or (account.student_id = '2220' and day_slot.slot in (1, 2, 3, 4))
    or (account.student_id = '2222' and day_slot.slot = 5)
    or (account.student_id = '2228' and day_slot.slot = 3)
    or (account.student_id = '2230' and day_slot.slot in (1, 2, 3, 5))
    or (account.student_id = '2233' and day_slot.slot in (1, 2, 3))
  ))
);

commit;
