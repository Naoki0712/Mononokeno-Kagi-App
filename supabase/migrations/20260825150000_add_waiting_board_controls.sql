alter table private.waiting_tickets
  add column if not exists manually_issued boolean not null default false,
  add column if not exists pending_at timestamptz;

alter table private.waiting_tickets
  drop constraint if exists waiting_tickets_status_check;

alter table private.waiting_tickets
  add constraint waiting_tickets_status_check
  check (status in ('waiting', 'called', 'pending', 'redeemed', 'expired', 'cancelled'));

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

  select coalesce(jsonb_agg(jsonb_build_object(
    'ticket_number', ticket.ticket_number,
    'status', ticket.status,
    'issued_at', ticket.issued_at,
    'scheduled_at', ticket.scheduled_at,
    'called_at', ticket.called_at,
    'pending_at', ticket.pending_at,
    'redeemed_at', ticket.redeemed_at,
    'manually_issued', ticket.manually_issued
  ) order by ticket.ticket_number), '[]'::jsonb)
  into v_tickets
  from private.waiting_tickets as ticket
  where ticket.queue_date = v_today
    and ticket.status in ('waiting', 'called', 'pending');

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
    select 1 from private.waiting_tickets
    where queue_date = v_today and status = 'called' and ticket_number <> p_ticket_number
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
  return jsonb_build_object('ok', true, 'ticket_number', p_ticket_number, 'status', p_status, 'server_now', now());
end;
$function$;

create or replace function public.waiting_admin_issue_manual(p_classmate_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin_id text;
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_number integer;
  v_wait integer;
begin
  v_admin_id := private.waiting_admin_student_id(p_classmate_token);
  if v_admin_id is null then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(9026, 1);
  select coalesce(max(ticket_number), 0) + 1 into v_number
  from private.waiting_tickets where queue_date = v_today;
  if v_number > 999 then
    return jsonb_build_object('ok', false, 'reason', 'sold_out');
  end if;
  select estimated_wait_minutes into v_wait
  from private.waiting_queue_settings where singleton = true;
  insert into private.waiting_tickets (
    queue_date, ticket_number, device_token_hash, status, scheduled_at, manually_issued
  ) values (
    v_today, v_number, extensions.gen_random_bytes(32), 'waiting',
    now() + pg_catalog.make_interval(mins => v_wait), true
  );
  return jsonb_build_object('ok', true, 'ticket_number', v_number, 'server_now', now());
end;
$function$;

revoke all on function public.waiting_admin_move_ticket(text, integer, text) from public;
revoke all on function public.waiting_admin_issue_manual(text) from public;
grant execute on function public.waiting_admin_move_ticket(text, integer, text) to anon, authenticated;
grant execute on function public.waiting_admin_issue_manual(text) to anon, authenticated;

-- A held ticket remains valid and appears as waiting to its visitor device.
create or replace function public.waiting_ticket_status(p_device_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
  select * into v_ticket from private.waiting_tickets
  where device_token_hash = v_hash and queue_date = v_today limit 1;
  select issuing_enabled, estimated_wait_minutes into v_enabled, v_wait
  from private.waiting_queue_settings where singleton = true;
  if v_ticket.id is null then
    return jsonb_build_object('ok', true, 'has_ticket', false, 'enabled', v_enabled,
      'estimated_wait_minutes', v_wait, 'server_now', now());
  end if;
  return jsonb_build_object(
    'ok', true, 'has_ticket', true, 'enabled', v_enabled,
    'estimated_wait_minutes', v_wait, 'ticket_number', v_ticket.ticket_number,
    'queue_date', v_ticket.queue_date,
    'status', case when v_ticket.status = 'pending' then 'waiting' else v_ticket.status end,
    'issued_at', v_ticket.issued_at, 'scheduled_at', v_ticket.scheduled_at,
    'called_at', v_ticket.called_at,
    'call_window_ends_at', case when v_ticket.called_at is null then null else v_ticket.called_at + interval '15 minutes' end,
    'redeemed_at', v_ticket.redeemed_at, 'server_now', now()
  );
end;
$function$;
