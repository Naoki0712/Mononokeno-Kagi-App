create or replace function private.waiting_admin_student_id(p_token text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select session.student_id
  from private.classmate_sessions as session
  join private.classmate_accounts as account
    on account.student_id = session.student_id
   and account.enabled
  where char_length(p_token) = 64
    and session.token_hash =
      extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
    and session.expires_at > now()
  limit 1;
$$;

revoke all on function private.waiting_admin_student_id(text)
  from public, anon, authenticated;
