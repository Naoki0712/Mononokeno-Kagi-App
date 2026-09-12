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
      and ticket.status = 'waiting'
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

create or replace function public.waiting_queue_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with estimate as (
    select
      settings.issuing_enabled,
      private.waiting_service_interval_minutes(
        (now() at time zone 'Asia/Tokyo')::date
      ) * (
        select count(*)::integer + 1
        from private.waiting_tickets as ticket
        where ticket.queue_date = (now() at time zone 'Asia/Tokyo')::date
          and ticket.status = 'waiting'
      ) as service_minutes
    from private.waiting_queue_settings as settings
    where settings.singleton = true
  )
  select jsonb_build_object(
    'ok', true,
    'enabled', estimate.issuing_enabled,
    'estimated_wait_minutes',
      ceil(
        extract(
          epoch from (
            private.waiting_add_service_minutes(now(), estimate.service_minutes) - now()
          )
        ) / 60.0
      )::integer,
    'server_now', now()
  )
  from estimate;
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
    and ticket.status = 'waiting';

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
  v_service_minutes integer;
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
    into v_service_minutes
  from private.waiting_tickets as ticket
  where ticket.queue_date = v_today
    and ticket.status = 'waiting';

  v_wait := ceil(
    extract(
      epoch from (
        private.waiting_add_service_minutes(now(), v_service_minutes) - now()
      )
    ) / 60.0
  )::integer;

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
    and status = 'waiting';

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
  v_previous_status text;
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

  select status
    into v_previous_status
  from private.waiting_tickets
  where queue_date = v_today
    and ticket_number = p_ticket_number
    and status in ('waiting', 'called', 'pending')
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  update private.waiting_tickets
  set status = p_status,
      called_at = case when p_status = 'called' then now() else null end,
      pending_at = case when p_status = 'pending' then now() else null end
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
$$;

select private.waiting_recalculate_schedule(
  (now() at time zone 'Asia/Tokyo')::date
);

revoke all on function private.waiting_recalculate_schedule(date) from public;
revoke all on function public.waiting_queue_status() from public, anon, authenticated;
revoke all on function public.waiting_issue_ticket(text) from public, anon, authenticated;
revoke all on function public.waiting_ticket_status(text) from public, anon, authenticated;
revoke all on function public.waiting_admin_issue_manual(text) from public, anon, authenticated;
revoke all on function public.waiting_admin_move_ticket(text, integer, text) from public, anon, authenticated;

grant execute on function public.waiting_queue_status() to anon, authenticated;
grant execute on function public.waiting_issue_ticket(text) to anon, authenticated;
grant execute on function public.waiting_ticket_status(text) to anon, authenticated;
grant execute on function public.waiting_admin_issue_manual(text) to anon, authenticated;
grant execute on function public.waiting_admin_move_ticket(text, integer, text) to anon, authenticated;

comment on function private.waiting_recalculate_schedule(date) is
  'Recalculates scheduled times for the normal waiting lane only; pending tickets are excluded.';
