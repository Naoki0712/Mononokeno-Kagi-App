create table if not exists private.classmate_login_attempts (
  student_id text primary key check (student_id ~ '^[0-9]{4}$'),
  failure_count integer not null default 0 check (failure_count >= 0),
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz
);

revoke all on table private.classmate_login_attempts from public, anon, authenticated;

create index if not exists classmate_sessions_student_id_idx
  on private.classmate_sessions (student_id);

create or replace function public.classmate_login(
  p_student_id text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id text := btrim(coalesce(p_student_id, ''));
  v_password_hash text;
  v_enabled boolean;
  v_blocked_until timestamptz;
  v_password_valid boolean := false;
  v_token text;
begin
  if v_student_id !~ '^[0-9]{4}$'
    or p_password is null
    or char_length(p_password) > 128 then
    return jsonb_build_object('ok', false, 'message', 'IDまたはパスワードが正しくありません。');
  end if;

  select attempts.blocked_until
    into v_blocked_until
  from private.classmate_login_attempts as attempts
  where attempts.student_id = v_student_id
  for update;

  if v_blocked_until is not null and v_blocked_until > now() then
    return jsonb_build_object('ok', false, 'message', 'しばらく時間を空けてから、もう一度お試しください。');
  end if;

  select account.password_hash, account.enabled
    into v_password_hash, v_enabled
  from private.classmate_accounts as account
  where account.student_id = v_student_id;

  if v_password_hash is not null and v_enabled then
    v_password_valid := extensions.crypt(p_password, v_password_hash) = v_password_hash;
  end if;

  if not v_password_valid then
    insert into private.classmate_login_attempts as attempts (
      student_id,
      failure_count,
      window_started_at,
      blocked_until
    )
    values (v_student_id, 1, now(), null)
    on conflict (student_id) do update
    set
      failure_count = case
        when attempts.window_started_at < now() - interval '15 minutes' then 1
        else attempts.failure_count + 1
      end,
      window_started_at = case
        when attempts.window_started_at < now() - interval '15 minutes' then now()
        else attempts.window_started_at
      end,
      blocked_until = case
        when attempts.window_started_at >= now() - interval '15 minutes'
          and attempts.failure_count + 1 >= 5
        then now() + interval '15 minutes'
        else null
      end;

    return jsonb_build_object('ok', false, 'message', 'IDまたはパスワードが正しくありません。');
  end if;

  delete from private.classmate_login_attempts
  where student_id = v_student_id;

  delete from private.classmate_sessions
  where expires_at <= now();

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into private.classmate_sessions (token_hash, student_id, expires_at)
  values (
    extensions.digest(v_token, 'sha256'),
    v_student_id,
    now() + interval '12 hours'
  );

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'student_id', v_student_id,
    'expires_in', 43200
  );
end;
$$;

revoke all on function public.classmate_login(text, text) from public, authenticated;
grant execute on function public.classmate_login(text, text) to anon;

revoke all on function public.classmate_session(text) from public, authenticated;
grant execute on function public.classmate_session(text) to anon;

revoke all on function public.classmate_logout(text) from public, authenticated;
grant execute on function public.classmate_logout(text) to anon;
