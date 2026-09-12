begin;

update private.festival_shift_assignments
set student_id = '2203', updated_at = now(), updated_by = null
where festival_day = 'sun'
  and slot = 2
  and role = 'staff'
  and position = 1
  and student_id = '2231';

update private.festival_shift_assignments
set student_id = '2216', updated_at = now(), updated_by = null
where festival_day = 'sun'
  and slot = 2
  and role = 'staff'
  and position = 6
  and student_id = '2232';

update private.festival_shift_assignments
set student_id = '2233', updated_at = now(), updated_by = null
where festival_day = 'sun'
  and slot = 5
  and role = 'staff'
  and position = 6
  and student_id = '2232';

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
    account.student_id in ('2209', '2212', '2221', '2231', '2232')
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
