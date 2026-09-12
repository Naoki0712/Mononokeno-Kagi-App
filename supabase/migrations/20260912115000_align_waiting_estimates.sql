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
          and ticket.status in ('waiting', 'pending')
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
    and ticket.status in ('waiting', 'pending');

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
