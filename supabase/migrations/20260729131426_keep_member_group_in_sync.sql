create or replace function private.sync_member_schedule_group()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new."group" := case
    when new.id in ('2210', '2211') then 'Class-leader'
    when new.id = '2216' then 'Layout'
    when new.id = '2217' then 'Gimmick'
    when new.id = '2218' then 'Decoration'
    when new.id = '2221' then 'Gadget'
    when new.id in ('2202', '2204', '2215', '2223') then 'Story'
    else null
  end;
  return new;
end;
$$;

revoke execute on function private.sync_member_schedule_group()
  from public, anon, authenticated;

drop trigger if exists member_schedule_group_sync
  on public.member_schedule;

create trigger member_schedule_group_sync
before insert or update of id
on public.member_schedule
for each row
execute function private.sync_member_schedule_group();
