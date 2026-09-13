alter table private.waiting_tickets
  add column if not exists party_size smallint not null default 1
    check (party_size between 1 and 3);

drop function public.waiting_issue_ticket(text);

create function public.waiting_issue_ticket(
  p_device_token text,
  p_party_size integer default 1
)
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

  if p_party_size is null or p_party_size not between 1 and 3 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_party_size');
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
      'party_size', v_ticket.party_size,
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
    party_size,
    scheduled_at
  )
  values (
    v_today,
    v_next_number,
    v_device_hash,
    p_party_size,
    private.waiting_add_service_minutes(now(), v_interval * v_position)
  )
  returning * into v_ticket;

  return jsonb_build_object(
    'ok', true,
    'existing', false,
    'ticket_number', v_ticket.ticket_number,
    'party_size', v_ticket.party_size,
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
  v_waiting_people integer;
  v_active_people integer;
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

  select
    private.waiting_service_interval_minutes(v_today) * (count(*) filter (where ticket.status = 'waiting')::integer + 1),
    coalesce(sum(ticket.party_size) filter (where ticket.status = 'waiting'), 0)::integer,
    coalesce(sum(ticket.party_size) filter (where ticket.status in ('waiting', 'called', 'pending', 'redeemed')), 0)::integer
    into v_service_minutes, v_waiting_people, v_active_people
  from private.waiting_tickets as ticket
  where ticket.queue_date = v_today;

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
      'waiting_people_count', v_waiting_people,
      'active_people_count', v_active_people,
      'server_now', now()
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'has_ticket', true,
    'enabled', v_enabled,
    'estimated_wait_minutes', v_wait,
    'waiting_people_count', v_waiting_people,
    'active_people_count', v_active_people,
    'ticket_number', v_ticket.ticket_number,
    'party_size', v_ticket.party_size,
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

create or replace function public.waiting_queue_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with counts as (
    select
      count(*) filter (where ticket.status = 'waiting')::integer as waiting_groups,
      coalesce(sum(ticket.party_size) filter (where ticket.status = 'waiting'), 0)::integer as waiting_people,
      coalesce(sum(ticket.party_size) filter (where ticket.status in ('waiting', 'called', 'pending', 'redeemed')), 0)::integer as active_people
    from private.waiting_tickets as ticket
    where ticket.queue_date = (now() at time zone 'Asia/Tokyo')::date
  ), estimate as (
    select
      settings.issuing_enabled,
      private.waiting_service_interval_minutes(
        (now() at time zone 'Asia/Tokyo')::date
      ) * (counts.waiting_groups + 1) as service_minutes,
      counts.waiting_people,
      counts.active_people
    from private.waiting_queue_settings as settings
    cross join counts
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
    'waiting_people_count', estimate.waiting_people,
    'active_people_count', estimate.active_people,
    'server_now', now()
  )
  from estimate;
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
        'party_size', ticket.party_size,
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
    'waiting_people_count', (select coalesce(sum(party_size), 0) from private.waiting_tickets where queue_date = v_today and status = 'waiting'),
    'active_people_count', (select coalesce(sum(party_size), 0) from private.waiting_tickets where queue_date = v_today and status in ('waiting', 'called', 'pending', 'redeemed')),
    'called_count', (select count(*) from private.waiting_tickets where queue_date = v_today and status = 'called'),
    'redeemed_count', (select count(*) from private.waiting_tickets where queue_date = v_today and status = 'redeemed'),
    'last_issued_number', coalesce((select max(ticket_number) from private.waiting_tickets where queue_date = v_today), 0),
    'next_waiting_number', (select min(ticket_number) from private.waiting_tickets where queue_date = v_today and status = 'waiting'),
    'tickets', v_tickets,
    'server_now', now()
  );
end;
$function$;

revoke all on function public.waiting_issue_ticket(text, integer) from public, anon, authenticated;
revoke all on function public.waiting_ticket_status(text) from public, anon, authenticated;
revoke all on function public.waiting_queue_status() from public, anon, authenticated;
revoke all on function public.waiting_admin_snapshot(text) from public, anon, authenticated;

grant execute on function public.waiting_issue_ticket(text, integer) to anon, authenticated;
grant execute on function public.waiting_ticket_status(text) to anon, authenticated;
grant execute on function public.waiting_queue_status() to anon, authenticated;
grant execute on function public.waiting_admin_snapshot(text) to anon, authenticated;

comment on column private.waiting_tickets.party_size is
  'Number of guests represented by this ticket. Valid values are 1 through 3.';

comment on function public.waiting_issue_ticket(text, integer) is
  'Issues one numbered ticket for a group of one to three guests.';
