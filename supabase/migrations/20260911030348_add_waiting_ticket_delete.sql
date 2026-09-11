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
begin
  v_admin_id := private.waiting_admin_student_id(p_classmate_token);
  if v_admin_id is null then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  update private.waiting_tickets
  set status = 'cancelled',
      called_at = null,
      pending_at = null
  where queue_date = v_today
    and ticket_number = p_ticket_number
    and status in ('waiting', 'called', 'pending');

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'ticket_number', p_ticket_number,
    'status', 'cancelled',
    'server_now', now()
  );
end;
$function$;

revoke all on function public.waiting_admin_delete_ticket(text, integer) from public, anon, authenticated;
grant execute on function public.waiting_admin_delete_ticket(text, integer) to anon, authenticated;

comment on function public.waiting_admin_delete_ticket(text, integer) is
  'Cancels one active waiting ticket after validating an approved classmate session token.';
