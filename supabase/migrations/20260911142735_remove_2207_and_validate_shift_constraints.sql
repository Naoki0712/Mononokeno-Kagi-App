delete from private.festival_shift_eligibility
where student_id = '2207';

update private.festival_shift_assignments
set student_id = '2203', updated_at = now(), updated_by = null
where festival_day = 'sat' and slot = 4 and role = 'staff' and position = 3
  and student_id = '2220';

update private.festival_shift_assignments
set student_id = '2220', updated_at = now(), updated_by = null
where festival_day = 'sat' and slot = 5 and role = 'checkout' and position = 1
  and student_id = '2207';

update private.festival_shift_assignments
set student_id = '2231', updated_at = now(), updated_by = null
where festival_day = 'sun' and slot = 2 and role = 'staff' and position = 1
  and student_id = '2207';

update private.festival_shift_assignments
set student_id = '2203', updated_at = now(), updated_by = null
where festival_day = 'sun' and slot = 5 and role = 'staff' and position = 1
  and student_id = '2207';
