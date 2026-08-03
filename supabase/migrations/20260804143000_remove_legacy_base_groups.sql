update public.member_schedule
set "group" = null
where "group" in ('Signboard', 'Yokai');

alter table public.member_schedule
  drop constraint if exists member_schedule_group_check;

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
      'Story'
    )
  );
