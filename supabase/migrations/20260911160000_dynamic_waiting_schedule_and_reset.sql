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
  select coalesce(
    greatest(
      2,
      least(
        20,
        round(avg(extract(epoch from duration)) / 60.0)::integer
      )
    ),
    8
  )
  from call_intervals
  where duration between interval '1 minute' and interval '30 minutes';
$$;

create or replace function private.waiting_add_service_minutes(
  p_start timestamptz,
  p_minutes integer
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_local_start timestamp := p_start at time zone 'Asia/Tokyo';
  v_lunch_start timestamp;
  v_lunch_end timestamp;
  v_local_result timestamp;
begin
  v_lunch_start := date_trunc('day', v_local_start) + interval '12 hours';
  v_lunch_end := date_trunc('day', v_local_start) + interval '13 hours';

  if v_local_start >= v_lunch_start and v_local_start < v_lunch_end then
    v_local_start := v_lunch_end;
  end if;

  v_local_result := v_local_start + pg_catalog.make_interval(mins => greatest(p_minutes, 0));

  if v_local_start < v_lunch_start and v_local_result >= v_lunch_start then
    v_local_result := v_local_result + interval '1 hour';
  end if;

  return v_local_result at time zone 'Asia/Tokyo';
end;
$$;

create or replace function private.waiting_recalculate_schedule(p_queue_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_interval integer := private.waiting_service_interval_minutes(p_queue_date);
begin
  with ranked as (
    select
      ticket.id,
      row_number() over (order by ticket.ticket_number)::integer as queue_position
    from private.waiting_tickets as ticket
    where ticket.queue_date = p_queue_date
      and ticket.status in ('waiting', 'pending')
  )
  update private.waiting_tickets as ticket
  set scheduled_at = private.waiting_add_service_minutes(
    now(),
    v_interval * ranked.queue_position
  )
  from ranked
  where ticket.id = ranked.id;
end;
$$;

revoke all on function private.waiting_service_interval_minutes(date) from public;
revoke all on function private.waiting_add_service_minutes(timestamptz, integer) from public;
revoke all on function private.waiting_recalculate_schedule(date) from public;

update private.waiting_queue_settings
set estimated_wait_minutes = 8,
    updated_at = now()
where singleton = true;

create or replace function public.waiting_queue_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', true,
    'enabled', settings.issuing_enabled,
    'estimated_wait_minutes',
      private.waiting_service_interval_minutes((now() at time zone 'Asia/Tokyo')::date)
      * (
        select count(*)::integer + 1
        from private.waiting_tickets as ticket
        where ticket.queue_date = (now() at time zone 'Asia/Tokyo')::date
          and ticket.status in ('waiting', 'pending')
      ),
    'server_now', now()
  )
  from private.waiting_queue_settings as settings
  where settings.singleton = true;
$$;

create or replace function public.waiting_issue_ticket(p_device_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_device_hash bytea;
  v_enabled boolean;
  v_ticket private.waiting_tickets%rowtype;
  v_next_number integer;
  v_interval integer;
  v_position integer;
begin
  if p_device_token is null or p_device_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_token');
  end if;

  v_device_hash := extensions.digest(convert_to(p_device_token, 'UTF8'), 'sha256');
  perform pg_catalog.pg_advisory_xact_lock(9026, 1);

  select *
    into v_ticket
  from private.waiting_tickets as ticket
  where ticket.queue_date = v_today
    and ticket.device_token_hash = v_device_hash
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'existing', true,
      'ticket_number', v_ticket.ticket_number,
      'queue_date', v_ticket.queue_date,
      'status', v_ticket.status,
      'issued_at', v_ticket.issued_at,
      'scheduled_at', v_ticket.scheduled_at,
      'called_at', v_ticket.called_at,
      'redeemed_at', v_ticket.redeemed_at,
      'server_now', now()
    );
  end if;

  select settings.issuing_enabled
    into v_enabled
  from private.waiting_queue_settings as settings
  where settings.singleton = true
  for update;

  v_interval := private.waiting_service_interval_minutes(v_today);

  select count(*)::integer + 1
    into v_position
  from private.waiting_tickets as ticket
  where ticket.queue_date = v_today
    and ticket.status in ('waiting', 'pending');

  if not v_enabled then
    return jsonb_build_object(
      'ok', false,
      'reason', 'disabled',
      'estimated_wait_minutes', v_interval * v_position,
      'server_now', now()
    );
  end if;

  select coalesce(max(ticket.ticket_number), 0) + 1
    into v_next_number
  from private.waiting_tickets as ticket
  where ticket.queue_date = v_today;

  if v_next_number > 999 then
    return jsonb_build_object('ok', false, 'reason', 'sold_out');
  end if;

  insert into private.waiting_tickets (
    queue_date,
    ticket_number,
    device_token_hash,
    scheduled_at
  )
  values (
    v_today,
    v_next_number,
    v_device_hash,
    private.waiting_add_service_minutes(now(), v_interval * v_position)
  )
  returning * into v_ticket;

  return jsonb_build_object(
    'ok', true,
    'existing', false,
    'ticket_number', v_ticket.ticket_number,
    'queue_date', v_ticket.queue_date,
    'status', v_ticket.status,
    'issued_at', v_ticket.issued_at,
    'scheduled_at', v_ticket.scheduled_at,
    'called_at', v_ticket.called_at,
    'redeemed_at', v_ticket.redeemed_at,
    'server_now', now()
  );
end;
$$;

create or replace function public.waiting_ticket_status(p_device_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_hash bytea;
  v_ticket private.waiting_tickets%rowtype;
  v_enabled boolean;
  v_wait integer;
begin
  if p_device_token is null or p_device_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_token');
  end if;

  v_hash := extensions.digest(convert_to(p_device_token, 'UTF8'), 'sha256');

  select *
    into v_ticket
  from private.waiting_tickets
  where device_token_hash = v_hash
    and queue_date = v_today
  limit 1;

  select settings.issuing_enabled
    into v_enabled
  from private.waiting_queue_settings as settings
  where settings.singleton = true;

  select private.waiting_service_interval_minutes(v_today) * (count(*)::integer + 1)
    into v_wait
  from private.waiting_tickets as ticket
  where ticket.queue_date = v_today
    and ticket.status in ('waiting', 'pending');

  if v_ticket.id is null then
    return jsonb_build_object(
      'ok', true,
      'has_ticket', false,
      'enabled', v_enabled,
      'estimated_wait_minutes', v_wait,
      'server_now', now()
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'has_ticket', true,
    'enabled', v_enabled,
    'estimated_wait_minutes', v_wait,
    'ticket_number', v_ticket.ticket_number,
    'queue_date', v_ticket.queue_date,
    'status', case when v_ticket.status = 'pending' then 'waiting' else v_ticket.status end,
    'issued_at', v_ticket.issued_at,
    'scheduled_at', v_ticket.scheduled_at,
    'called_at', v_ticket.called_at,
    'call_window_ends_at', case
      when v_ticket.called_at is null then null
      else v_ticket.called_at + interval '15 minutes'
    end,
    'redeemed_at', v_ticket.redeemed_at,
    'server_now', now()
  );
end;
$$;

create or replace function public.waiting_admin_issue_manual(p_classmate_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id text;
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_number integer;
  v_interval integer;
  v_position integer;
begin
  v_admin_id := private.waiting_admin_student_id(p_classmate_token);
  if v_admin_id is null then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(9026, 1);

  select coalesce(max(ticket_number), 0) + 1
    into v_number
  from private.waiting_tickets
  where queue_date = v_today;

  if v_number > 999 then
    return jsonb_build_object('ok', false, 'reason', 'sold_out');
  end if;

  v_interval := private.waiting_service_interval_minutes(v_today);

  select count(*)::integer + 1
    into v_position
  from private.waiting_tickets
  where queue_date = v_today
    and status in ('waiting', 'pending');

  insert into private.waiting_tickets (
    queue_date,
    ticket_number,
    device_token_hash,
    status,
    scheduled_at,
    manually_issued
  )
  values (
    v_today,
    v_number,
    extensions.gen_random_bytes(32),
    'waiting',
    private.waiting_add_service_minutes(now(), v_interval * v_position),
    true
  );

  return jsonb_build_object('ok', true, 'ticket_number', v_number, 'server_now', now());
end;
$$;

create or replace function public.waiting_admin_move_ticket(
  p_classmate_token text,
  p_ticket_number integer,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id text;
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
begin
  v_admin_id := private.waiting_admin_student_id(p_classmate_token);
  if v_admin_id is null then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  if p_status not in ('waiting', 'called', 'pending') then
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

  update private.waiting_tickets
  set status = p_status,
      called_at = case when p_status = 'called' then now() else null end,
      pending_at = case when p_status = 'pending' then now() else null end
  where queue_date = v_today
    and ticket_number = p_ticket_number
    and status in ('waiting', 'called', 'pending');

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if p_status = 'called' then
    perform private.waiting_recalculate_schedule(v_today);
  end if;

  return jsonb_build_object(
    'ok', true,
    'ticket_number', p_ticket_number,
    'status', p_status,
    'server_now', now()
  );
end;
$$;

create or replace function public.waiting_admin_reset_tickets(p_classmate_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id text;
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_deleted_count integer;
begin
  v_admin_id := private.waiting_admin_student_id(p_classmate_token);
  if v_admin_id is null then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(9026, 1);
  perform pg_catalog.pg_advisory_xact_lock(9026, 3);

  delete from private.waiting_tickets
  where queue_date = v_today;

  get diagnostics v_deleted_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'deleted_count', v_deleted_count,
    'next_ticket_number', 1,
    'server_now', now()
  );
end;
$$;

revoke all on function public.waiting_admin_reset_tickets(text) from public;
revoke all on function public.waiting_admin_reset_tickets(text) from anon;
revoke all on function public.waiting_admin_reset_tickets(text) from authenticated;
grant execute on function public.waiting_admin_reset_tickets(text) to anon, authenticated;
