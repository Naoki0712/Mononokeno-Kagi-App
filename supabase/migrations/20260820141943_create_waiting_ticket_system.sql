create table if not exists private.waiting_queue_settings (
  singleton boolean primary key default true check (singleton),
  issuing_enabled boolean not null default false,
  estimated_wait_minutes integer not null default 60
    check (estimated_wait_minutes between 1 and 240),
  updated_at timestamptz not null default now(),
  updated_by text references private.classmate_accounts(student_id) on delete set null
);

insert into private.waiting_queue_settings (
  singleton,
  issuing_enabled,
  estimated_wait_minutes
)
values (true, false, 60)
on conflict (singleton) do nothing;

create table if not exists private.waiting_tickets (
  id bigint generated always as identity primary key,
  queue_date date not null,
  ticket_number integer not null check (ticket_number between 1 and 999),
  device_token_hash bytea not null,
  status text not null default 'waiting'
    check (status in ('waiting', 'called', 'redeemed', 'expired', 'cancelled')),
  issued_at timestamptz not null default now(),
  scheduled_at timestamptz not null,
  called_at timestamptz,
  redeemed_at timestamptz,
  unique (queue_date, ticket_number),
  unique (queue_date, device_token_hash)
);

create index if not exists waiting_tickets_queue_status_number_idx
  on private.waiting_tickets (queue_date, status, ticket_number);

create index if not exists waiting_tickets_device_hash_idx
  on private.waiting_tickets (device_token_hash, queue_date desc);

alter table private.waiting_queue_settings enable row level security;
alter table private.waiting_tickets enable row level security;

revoke all on table private.waiting_queue_settings
  from public, anon, authenticated;
revoke all on table private.waiting_tickets
  from public, anon, authenticated;
revoke all on all sequences in schema private
  from public, anon, authenticated;

create or replace function private.waiting_admin_student_id(p_token text)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select session.student_id
  from private.classmate_sessions as session
  join private.classmate_accounts as account
    on account.student_id = session.student_id
   and account.enabled
  where char_length(p_token) = 64
    and session.token_hash =
      extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
    and session.expires_at > now()
    and session.student_id in ('2200', '2210', '2211', '2234', '2235', '2236')
  limit 1;
$function$;

revoke all on function private.waiting_admin_student_id(text)
  from public, anon, authenticated;

create or replace function public.waiting_queue_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'ok', true,
    'enabled', settings.issuing_enabled,
    'estimated_wait_minutes', settings.estimated_wait_minutes,
    'server_now', now()
  )
  from private.waiting_queue_settings as settings
  where settings.singleton = true;
$function$;

create or replace function public.waiting_issue_ticket(p_device_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_device_hash bytea;
  v_settings private.waiting_queue_settings%rowtype;
  v_ticket private.waiting_tickets%rowtype;
  v_next_number integer;
begin
  if p_device_token is null or p_device_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_token');
  end if;

  v_device_hash :=
    extensions.digest(convert_to(p_device_token, 'UTF8'), 'sha256');

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

  select *
    into v_settings
  from private.waiting_queue_settings as settings
  where settings.singleton = true
  for update;

  if not v_settings.issuing_enabled then
    return jsonb_build_object(
      'ok', false,
      'reason', 'disabled',
      'estimated_wait_minutes', v_settings.estimated_wait_minutes,
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
    now() + pg_catalog.make_interval(mins => v_settings.estimated_wait_minutes)
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
$function$;

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
  v_waiting integer;
  v_called integer;
  v_redeemed integer;
  v_last_issued integer;
  v_next_waiting integer;
begin
  v_admin_id := private.waiting_admin_student_id(p_classmate_token);

  if v_admin_id is null then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  update private.waiting_tickets as ticket
  set status = 'expired'
  where ticket.status in ('waiting', 'called')
    and (
      ticket.queue_date < v_today
      or (
        ticket.status = 'called'
        and ticket.called_at < now() - interval '15 minutes'
      )
    );

  select *
    into v_settings
  from private.waiting_queue_settings as settings
  where settings.singleton = true;

  select
    count(*) filter (where ticket.status = 'waiting'),
    count(*) filter (where ticket.status = 'called'),
    count(*) filter (where ticket.status = 'redeemed'),
    coalesce(max(ticket.ticket_number), 0),
    min(ticket.ticket_number) filter (where ticket.status = 'waiting')
  into
    v_waiting,
    v_called,
    v_redeemed,
    v_last_issued,
    v_next_waiting
  from private.waiting_tickets as ticket
  where ticket.queue_date = v_today;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'ticket_number', recent.ticket_number,
        'status', recent.status,
        'issued_at', recent.issued_at,
        'scheduled_at', recent.scheduled_at,
        'called_at', recent.called_at,
        'redeemed_at', recent.redeemed_at
      )
      order by recent.ticket_number desc
    ),
    '[]'::jsonb
  )
  into v_tickets
  from (
    select *
    from private.waiting_tickets as ticket
    where ticket.queue_date = v_today
    order by ticket.ticket_number desc
    limit 200
  ) as recent;

  return jsonb_build_object(
    'ok', true,
    'admin_student_id', v_admin_id,
    'enabled', v_settings.issuing_enabled,
    'estimated_wait_minutes', v_settings.estimated_wait_minutes,
    'waiting_count', v_waiting,
    'called_count', v_called,
    'redeemed_count', v_redeemed,
    'last_issued_number', v_last_issued,
    'next_waiting_number', v_next_waiting,
    'tickets', v_tickets,
    'server_now', now()
  );
end;
$function$;

create or replace function public.waiting_admin_set_queue(
  p_classmate_token text,
  p_enabled boolean,
  p_wait_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin_id text;
begin
  v_admin_id := private.waiting_admin_student_id(p_classmate_token);

  if v_admin_id is null then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  if p_enabled is null
    or p_wait_minutes is null
    or p_wait_minutes not between 1 and 240 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_settings');
  end if;

  update private.waiting_queue_settings
  set issuing_enabled = p_enabled,
      estimated_wait_minutes = p_wait_minutes,
      updated_at = now(),
      updated_by = v_admin_id
  where singleton = true;

  return jsonb_build_object(
    'ok', true,
    'enabled', p_enabled,
    'estimated_wait_minutes', p_wait_minutes,
    'updated_by', v_admin_id,
    'server_now', now()
  );
end;
$function$;

create or replace function public.waiting_admin_call_next(p_classmate_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin_id text;
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_ticket private.waiting_tickets%rowtype;
begin
  v_admin_id := private.waiting_admin_student_id(p_classmate_token);

  if v_admin_id is null then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(9026, 2);

  update private.waiting_tickets as ticket
  set status = 'expired'
  where ticket.status = 'called'
    and ticket.called_at < now() - interval '15 minutes';

  select *
    into v_ticket
  from private.waiting_tickets as ticket
  where ticket.queue_date = v_today
    and ticket.status = 'waiting'
  order by ticket.ticket_number
  for update skip locked
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'empty');
  end if;

  update private.waiting_tickets
  set status = 'called',
      called_at = now()
  where id = v_ticket.id
  returning * into v_ticket;

  return jsonb_build_object(
    'ok', true,
    'ticket_number', v_ticket.ticket_number,
    'status', v_ticket.status,
    'called_at', v_ticket.called_at,
    'call_window_ends_at', v_ticket.called_at + interval '15 minutes',
    'server_now', now()
  );
end;
$function$;

create or replace function public.waiting_admin_redeem(
  p_classmate_token text,
  p_qr_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin_id text;
  v_device_token text;
  v_device_hash bytea;
  v_ticket private.waiting_tickets%rowtype;
begin
  v_admin_id := private.waiting_admin_student_id(p_classmate_token);

  if v_admin_id is null then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  if p_qr_code is null
    or p_qr_code !~ '^mononoke-waiting:v1:[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_qr');
  end if;

  v_device_token := substring(p_qr_code from 21);
  v_device_hash :=
    extensions.digest(convert_to(v_device_token, 'UTF8'), 'sha256');

  select *
    into v_ticket
  from private.waiting_tickets as ticket
  where ticket.device_token_hash = v_device_hash
  order by ticket.queue_date desc, ticket.id desc
  for update
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invalid_qr');
  end if;

  if v_ticket.status = 'redeemed' then
    return jsonb_build_object(
      'ok', true,
      'reason', 'already_redeemed',
      'ticket_number', v_ticket.ticket_number,
      'redeemed_at', v_ticket.redeemed_at
    );
  end if;

  if v_ticket.status = 'waiting' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'not_called',
      'ticket_number', v_ticket.ticket_number
    );
  end if;

  if v_ticket.status = 'called'
    and v_ticket.called_at >= now() - interval '15 minutes' then
    update private.waiting_tickets
    set status = 'redeemed',
        redeemed_at = now()
    where id = v_ticket.id
    returning * into v_ticket;

    return jsonb_build_object(
      'ok', true,
      'reason', 'redeemed',
      'ticket_number', v_ticket.ticket_number,
      'redeemed_at', v_ticket.redeemed_at
    );
  end if;

  if v_ticket.status = 'called' then
    update private.waiting_tickets
    set status = 'expired'
    where id = v_ticket.id;

    return jsonb_build_object(
      'ok', false,
      'reason', 'expired',
      'ticket_number', v_ticket.ticket_number
    );
  end if;

  return jsonb_build_object(
    'ok', false,
    'reason', v_ticket.status,
    'ticket_number', v_ticket.ticket_number
  );
end;
$function$;

revoke all on function public.waiting_queue_status() from public;
revoke all on function public.waiting_issue_ticket(text) from public;
revoke all on function public.waiting_ticket_status(text) from public;
revoke all on function public.waiting_admin_snapshot(text) from public;
revoke all on function public.waiting_admin_set_queue(text, boolean, integer)
  from public;
revoke all on function public.waiting_admin_call_next(text) from public;
revoke all on function public.waiting_admin_redeem(text, text) from public;

grant execute on function public.waiting_queue_status()
  to anon, authenticated;
grant execute on function public.waiting_issue_ticket(text)
  to anon, authenticated;
grant execute on function public.waiting_ticket_status(text)
  to anon, authenticated;
grant execute on function public.waiting_admin_snapshot(text)
  to anon, authenticated;
grant execute on function public.waiting_admin_set_queue(text, boolean, integer)
  to anon, authenticated;
grant execute on function public.waiting_admin_call_next(text)
  to anon, authenticated;
grant execute on function public.waiting_admin_redeem(text, text)
  to anon, authenticated;

comment on table private.waiting_queue_settings is
  'Singleton runtime settings for timed-entry ticket issuance.';
comment on table private.waiting_tickets is
  'Daily timed-entry tickets, keyed by a one-way device token hash.';
comment on function public.waiting_issue_ticket(text) is
  'Atomically issues at most one daily timed-entry ticket per device token.';
comment on function public.waiting_ticket_status(text) is
  'Returns only the ticket matching the supplied random device token.';
comment on function public.waiting_admin_snapshot(text) is
  'Returns waiting-ticket operations data to approved on-site classmate IDs.';
