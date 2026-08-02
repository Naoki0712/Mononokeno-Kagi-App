with target(id, available_date, status) as (
  values
  ('2206',date '2026-08-03','unavailable'),('2206',date '2026-08-04','unavailable'),('2206',date '2026-08-05','unavailable'),('2206',date '2026-08-06','available'),
  ('2208',date '2026-08-03','unavailable'),('2208',date '2026-08-04','unavailable'),('2208',date '2026-08-05','unavailable'),('2208',date '2026-08-06','unavailable'),
  ('2212',date '2026-08-03','available'),('2212',date '2026-08-04','available'),('2212',date '2026-08-05','available'),('2212',date '2026-08-06','available'),
  ('2214',date '2026-08-03','unavailable'),('2214',date '2026-08-04','unavailable'),('2214',date '2026-08-05','available'),('2214',date '2026-08-06','available'),
  ('2219',date '2026-08-03','unavailable'),('2219',date '2026-08-04','unavailable'),('2219',date '2026-08-05','available'),('2219',date '2026-08-06','unavailable'),
  ('2222',date '2026-08-03','available'),('2222',date '2026-08-04','available'),('2222',date '2026-08-05','unavailable'),('2222',date '2026-08-06','unavailable'),
  ('2225',date '2026-08-03','available'),('2225',date '2026-08-04','unavailable'),('2225',date '2026-08-05','unavailable'),('2225',date '2026-08-06','available'),
  ('2227',date '2026-08-03','available'),('2227',date '2026-08-04','available'),('2227',date '2026-08-05','available'),('2227',date '2026-08-06','available'),
  ('2228',date '2026-08-03','available'),('2228',date '2026-08-04','available'),('2228',date '2026-08-05','available'),('2228',date '2026-08-06','unavailable'),
  ('2231',date '2026-08-03','available'),('2231',date '2026-08-04','unavailable'),('2231',date '2026-08-05','unavailable'),('2231',date '2026-08-06','unavailable'),
  ('2233',date '2026-08-03','available'),('2233',date '2026-08-04','available'),('2233',date '2026-08-05','unavailable'),('2233',date '2026-08-06','unavailable'),
  ('2220',date '2026-08-03','unavailable'),('2220',date '2026-08-04','unavailable'),('2220',date '2026-08-05','available'),('2220',date '2026-08-06','unavailable'),
  ('2230',date '2026-08-03','available'),('2230',date '2026-08-04','unavailable'),('2230',date '2026-08-05','unavailable'),('2230',date '2026-08-06','unavailable')
)
insert into public.member_schedule (id, available_date, status)
select id, available_date, status from target
on conflict (id, available_date) do update
set status=excluded.status, updated_at=now();

with assignments(id,title,team) as (
  values
  ('2206','妖怪を考える','物語'),
  ('2208','妖怪を考える','物語'),
  ('2212','妖怪を考える','物語'),
  ('2214','妖怪を考える','物語'),
  ('2219','妖怪を考える','物語'),
  ('2222','看板を作る','小道具制作'),
  ('2225','看板を作る','小道具制作'),
  ('2227','妖怪を考える','物語'),
  ('2228','妖怪を考える','物語'),
  ('2231','妖怪を考える','物語'),
  ('2233','妖怪を考える','物語'),
  ('2220','看板を作る','小道具制作'),
  ('2230','看板を作る','小道具制作')
)
insert into public.class_schedule
  (title,available_date,available_time,end_time,assignee,team,location,description)
select a.title,m.available_date,time '13:30',time '14:30',a.id,a.team,'HR 2-6',''
from assignments a
join public.member_schedule m on m.id=a.id and m.status='available'
where m.available_date between date '2026-08-03' and date '2026-08-06'
  and not exists (
    select 1 from public.class_schedule e
    where e.title=a.title and e.available_date=m.available_date
      and e.available_time=time '13:30' and e.end_time=time '14:30'
      and e.assignee=a.id and e.location='HR 2-6'
  );

create or replace function public.classmate_schedule(p_token text)
returns table (
  id uuid,
  title text,
  event_date date,
  start_time time,
  end_time time,
  assignee text,
  team text,
  location text,
  description text
)
language sql
stable
security definer
set search_path = ''
as $function$
  with current_session as (
    select session.student_id
    from private.classmate_sessions as session
    join private.classmate_accounts as account
      on account.student_id = session.student_id
     and account.enabled
    where char_length(p_token) = 64
      and session.token_hash =
        extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
      and session.expires_at > now()
    limit 1
  )
  select
    event.id::uuid,
    event.title,
    event.available_date,
    event.available_time,
    event.end_time,
    event.assignee,
    event.team,
    event.location,
    event.description
  from public.class_schedule as event
  cross join current_session
  order by
    event.available_date,
    event.available_time nulls last,
    event.title,
    event.assignee;
$function$;
