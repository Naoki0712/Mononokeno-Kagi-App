create or replace function private.waiting_service_interval_minutes(p_queue_date date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with recent_calls as (
    select source.called_at
    from (
      select ticket.called_at
      from private.waiting_tickets as ticket
      where ticket.queue_date = p_queue_date
        and ticket.called_at is not null
      order by ticket.called_at desc
      limit 9
    ) as source
    order by source.called_at
  ), call_intervals as (
    select called_at - lag(called_at) over (order by called_at) as duration
    from recent_calls
  )
  select greatest(
    2,
    least(
      20,
      coalesce(
        round(avg(extract(epoch from duration)) / 60.0)::integer,
        8
      )
    )
  )
  from call_intervals
  where duration between interval '1 minute' and interval '30 minutes';
$$;

select private.waiting_recalculate_schedule(
  (now() at time zone 'Asia/Tokyo')::date
);
