begin;

delete from private.festival_shift_assignments
where festival_day = 'sun';

with sunday_shift(slot, role, student_ids) as (
  values
    (1, 'reception', array['2205', '2206']),
    (1, 'staff', array['2207', '2218', '2222', '2224', '2226']),
    (1, 'checkout', array['2227']),
    (1, 'backup', array['2228', '2229']),
    (2, 'reception', array['2213', '2214']),
    (2, 'staff', array['2206', '2218', '2222', '2224', '2226']),
    (2, 'checkout', array['2225']),
    (2, 'backup', array['2227', '2228']),
    (3, 'reception', array['2207', '2208']),
    (3, 'staff', array['2213', '2214', '2216', '2218', '2224']),
    (3, 'checkout', array['2225']),
    (3, 'backup', array['2226', '2229']),
    (4, 'reception', array['2205', '2230']),
    (4, 'staff', array['2207', '2208', '2213', '2214', '2222']),
    (4, 'checkout', array['2225']),
    (4, 'backup', array['2227', '2228']),
    (5, 'reception', array['2216', '2233']),
    (5, 'staff', array['2213', '2214', '2218', '2224', '2226']),
    (5, 'checkout', array['2229']),
    (5, 'backup', array['2222', '2230']),
    (6, 'reception', array['2203', '2220']),
    (6, 'staff', array['2205', '2207', '2216', '2225', '2227']),
    (6, 'checkout', array['2233']),
    (6, 'backup', array['2228', '2229'])
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
select festival_day, slot, student_id
from private.festival_shift_assignments
where festival_day = 'sun'
on conflict do nothing;

commit;
