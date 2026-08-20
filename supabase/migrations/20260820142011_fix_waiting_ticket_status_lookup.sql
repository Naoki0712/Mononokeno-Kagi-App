create or replace function public.waiting_ticket_status(p_device_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_device_hash bytea;
  v_ticket private.waiting_tickets%rowtype;
  v_enabled boolean;
  v_wait_minutes integer;
begin
  if p_device_token is null or p_device_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_token');
  end if;

  v_device_hash :=
    extensions.digest(convert_to(p_device_token, 'UTF8'), 'sha256');

  update private.waiting_tickets as ticket
  set status = 'expired'
  where ticket.device_token_hash = v_device_hash
    and ticket.status in ('waiting', 'called')
    and (
      ticket.queue_date < v_today
      or (
        ticket.status = 'called'
        and ticket.called_at < now() - interval '15 minutes'
      )
    );

  select *
    into v_ticket
  from private.waiting_tickets as ticket
  where ticket.device_token_hash = v_device_hash
    and ticket.queue_date = v_today
  limit 1;

  select settings.issuing_enabled, settings.estimated_wait_minutes
    into v_enabled, v_wait_minutes
  from private.waiting_queue_settings as settings
  where settings.singleton = true;

  if v_ticket.id is null then
    return jsonb_build_object(
      'ok', true,
      'has_ticket', false,
      'enabled', v_enabled,
      'estimated_wait_minutes', v_wait_minutes,
      'server_now', now()
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'has_ticket', true,
    'enabled', v_enabled,
    'estimated_wait_minutes', v_wait_minutes,
    'ticket_number', v_ticket.ticket_number,
    'queue_date', v_ticket.queue_date,
    'status', v_ticket.status,
    'issued_at', v_ticket.issued_at,
    'scheduled_at', v_ticket.scheduled_at,
    'called_at', v_ticket.called_at,
    'call_window_ends_at',
      case
        when v_ticket.called_at is null then null
        else v_ticket.called_at + interval '15 minutes'
      end,
    'redeemed_at', v_ticket.redeemed_at,
    'server_now', now()
  );
end;
$function$;

revoke all on function public.waiting_ticket_status(text) from public;
grant execute on function public.waiting_ticket_status(text)
  to anon, authenticated;
