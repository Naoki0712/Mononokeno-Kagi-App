alter table public.member_schedule
  drop constraint member_schedule_group_check;

alter table public.member_schedule
  add constraint member_schedule_group_check
  check (
    "group" is null
    or "group" in (
      'Class-leader',
      'Layout',
      'Gimmick',
      'Decoration',
      'Gadget',
      'Story',
      'Signboard',
      'Yokai'
    )
  );

with assignments(id, group_name) as (
  values
    ('2220','Signboard'),
    ('2222','Signboard'),
    ('2225','Signboard'),
    ('2230','Signboard'),
    ('2206','Yokai'),
    ('2208','Yokai'),
    ('2212','Yokai'),
    ('2214','Yokai'),
    ('2219','Yokai'),
    ('2227','Yokai'),
    ('2228','Yokai'),
    ('2231','Yokai'),
    ('2233','Yokai')
)
update public.member_schedule as schedule
set "group" = assignments.group_name,
    updated_at = now()
from assignments
where schedule.id = assignments.id
  and schedule.available_date between date '2026-08-03' and date '2026-08-06';
