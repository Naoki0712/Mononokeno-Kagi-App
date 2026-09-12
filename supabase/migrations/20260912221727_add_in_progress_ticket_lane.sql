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
        3
      )
    )
  )
  from call_intervals
  where duration between interval '1 minute' and interval '30 minutes';
$$;

create or replace function public.waiting_admin_snapshot(p_classmate_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin_id text;
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_settings private.waiting_queue_settings%rowtype;
  v_tickets jsonb;
begin
  v_admin_id := private.waiting_admin_student_id(p_classmate_token);
  if v_admin_id is null then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  select * into v_settings
  from private.waiting_queue_settings
  where singleton = true;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'ticket_number', ticket.ticket_number,
        'status', ticket.status,
        'issued_at', ticket.issued_at,
        'scheduled_at', ticket.scheduled_at,
        'called_at', ticket.called_at,
        'pending_at', ticket.pending_at,
        'redeemed_at', ticket.redeemed_at,
        'manually_issued', ticket.manually_issued
      )
      order by ticket.ticket_number
    ),
    '[]'::jsonb
  )
  into v_tickets
  from private.waiting_tickets as ticket
  where ticket.queue_date = v_today
    and ticket.status in ('waiting', 'called', 'pending', 'redeemed');

  return jsonb_build_object(
    'ok', true,
    'admin_student_id', v_admin_id,
    'enabled', v_settings.issuing_enabled,
    'estimated_wait_minutes', v_settings.estimated_wait_minutes,
    'waiting_count', (select count(*) from private.waiting_tickets where queue_date = v_today and status = 'waiting'),
    'called_count', (select count(*) from private.waiting_tickets where queue_date = v_today and status = 'called'),
    'redeemed_count', (select count(*) from private.waiting_tickets where queue_date = v_today and status = 'redeemed'),
    'last_issued_number', coalesce((select max(ticket_number) from private.waiting_tickets where queue_date = v_today), 0),
    'next_waiting_number', (select min(ticket_number) from private.waiting_tickets where queue_date = v_today and status = 'waiting'),
    'tickets', v_tickets,
    'server_now', now()
  );
end;
$function$;

create or replace function public.waiting_admin_move_ticket(
  p_classmate_token text,
  p_ticket_number integer,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin_id text;
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_previous_status text;
begin
  v_admin_id := private.waiting_admin_student_id(p_classmate_token);
  if v_admin_id is null then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  if p_status not in ('waiting', 'called', 'pending', 'redeemed') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_status');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(9026, 3);

  if p_status = 'called' and exists (
    select 1
    from private.waiting_tickets
    where queue_date = v_today
      and status = 'called'
      and ticket_number <> p_ticket_number
  ) then
    return jsonb_build_object('ok', false, 'reason', 'called_slot_occupied');
  end if;

  if p_status = 'redeemed' and (
    select count(*)
    from private.waiting_tickets
    where queue_date = v_today
      and status = 'redeemed'
      and ticket_number <> p_ticket_number
  ) >= 2 then
    return jsonb_build_object('ok', false, 'reason', 'in_progress_slots_occupied');
  end if;

  select status
    into v_previous_status
  from private.waiting_tickets
  where queue_date = v_today
    and ticket_number = p_ticket_number
    and status in ('waiting', 'called', 'pending', 'redeemed')
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  update private.waiting_tickets
  set status = p_status,
      called_at = case when p_status = 'called' then now() else called_at end,
      pending_at = case when p_status = 'pending' then now() else null end,
      redeemed_at = case when p_status = 'redeemed' then now() else null end
  where queue_date = v_today
    and ticket_number = p_ticket_number;

  if v_previous_status = 'waiting' or p_status = 'waiting' then
    perform private.waiting_recalculate_schedule(v_today);
  end if;

  return jsonb_build_object(
    'ok', true,
    'ticket_number', p_ticket_number,
    'status', p_status,
    'server_now', now()
  );
end;
$function$;

create or replace function public.waiting_admin_delete_ticket(
  p_classmate_token text,
  p_ticket_number integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin_id text;
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_previous_status text;
begin
  v_admin_id := private.waiting_admin_student_id(p_classmate_token);
  if v_admin_id is null then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  select status into v_previous_status
  from private.waiting_tickets
  where queue_date = v_today
    and ticket_number = p_ticket_number
    and status in ('waiting', 'called', 'pending', 'redeemed')
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  update private.waiting_tickets
  set status = 'cancelled',
      pending_at = null,
      redeemed_at = null
  where queue_date = v_today
    and ticket_number = p_ticket_number;

  if v_previous_status = 'waiting' then
    perform private.waiting_recalculate_schedule(v_today);
  end if;

  return jsonb_build_object(
    'ok', true,
    'ticket_number', p_ticket_number,
    'status', 'cancelled',
    'server_now', now()
  );
end;
$function$;

update private.waiting_queue_settings
set estimated_wait_minutes = 3,
    updated_at = now()
where singleton = true;

select private.waiting_recalculate_schedule((now() at time zone 'Asia/Tokyo')::date);

revoke all on function public.waiting_admin_redeem(text, text) from public, anon, authenticated;

comment on function public.waiting_admin_move_ticket(text, integer, text) is
  'Moves active tickets between waiting, called, pending, and the two-slot six-minute in-progress lane.';
