begin;

create table if not exists public.member_approvals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Discordユーザー',
  discord_id text,
  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.member_availability (
  availability_id uuid primary key default gen_random_uuid(),
  classmate_id text check (classmate_id is null or classmate_id ~ '^[0-9]{4}$'),
  user_id uuid references auth.users(id) on delete cascade,
  available_date date not null,
  availability_status text not null
    check (availability_status in ('available', 'unavailable')),
  updated_at timestamptz not null default now(),
  constraint member_availability_one_owner_check
    check ((classmate_id is null) <> (user_id is null)),
  constraint member_availability_open_date_check
    check (
      extract(isodow from available_date) between 1 and 5
      and available_date not between date '2026-08-10' and date '2026-08-17'
    )
);

create unique index if not exists member_availability_classmate_date_key
  on public.member_availability (classmate_id, available_date);

create unique index if not exists member_availability_discord_date_key
  on public.member_availability (user_id, available_date);

-- Preserve every existing row while separating its meaning.
insert into public.member_approvals (
  user_id, display_name, discord_id, approval_status, requested_at, reviewed_at
)
select
  user_id,
  max(display_name),
  max(discord_id),
  max(status) filter (where available_date is null),
  min(updated_at),
  case
    when max(status) filter (where available_date is null) in ('approved', 'rejected')
      then max(updated_at) filter (where available_date is null)
    else null
  end
from public.member_schedule
where user_id is not null and available_date is null
group by user_id
on conflict (user_id) do update
set display_name = excluded.display_name,
    discord_id = excluded.discord_id,
    approval_status = excluded.approval_status,
    reviewed_at = excluded.reviewed_at;

insert into public.member_availability (
  classmate_id, user_id, available_date, availability_status, updated_at
)
select id, user_id, available_date, status, updated_at
from public.member_schedule
where available_date is not null
  and status in ('available', 'unavailable')
  and ((id is null) <> (user_id is null))
on conflict do nothing;

alter table public.member_approvals enable row level security;
alter table public.member_availability enable row level security;

create or replace function private.is_approved_member(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.member_approvals
    where user_id = p_user_id and approval_status = 'approved'
  );
$$;

do $$
declare policy record;
begin
  for policy in select policyname from pg_policies
    where schemaname = 'public' and tablename in ('member_approvals', 'member_availability')
  loop
    execute format('drop policy %I on public.%I', policy.policyname,
      case when policy.policyname like 'approval:%' then 'member_approvals' else 'member_availability' end);
  end loop;
end;
$$;

create policy "approval: read own or admin"
on public.member_approvals for select to authenticated
using ((select auth.uid()) = user_id or private.is_portal_admin());

create policy "approval: request own"
on public.member_approvals for insert to authenticated
with check ((select auth.uid()) = user_id and approval_status = 'pending');

create policy "approval: admin review"
on public.member_approvals for update to authenticated
using (private.is_portal_admin()) with check (private.is_portal_admin());

create policy "availability: read own"
on public.member_availability for select to authenticated
using ((select auth.uid()) = user_id or private.is_portal_admin());

create policy "availability: add own"
on public.member_availability for insert to authenticated
with check (
  (select auth.uid()) = user_id and classmate_id is null
  and private.is_approved_member((select auth.uid()))
);

create policy "availability: update own"
on public.member_availability for update to authenticated
using ((select auth.uid()) = user_id and private.is_approved_member((select auth.uid())))
with check ((select auth.uid()) = user_id and classmate_id is null);

create policy "availability: delete own"
on public.member_availability for delete to authenticated
using ((select auth.uid()) = user_id and private.is_approved_member((select auth.uid())));

revoke all on public.member_approvals, public.member_availability from public, anon, authenticated;
grant select, insert on public.member_approvals to authenticated;
grant update (approval_status, reviewed_at) on public.member_approvals to authenticated;
grant select, insert, update, delete on public.member_availability to authenticated;

create or replace function public.classmate_availability(p_token text)
returns table (available_date date, status text)
language sql stable security definer set search_path = ''
as $$
  select answer.available_date, answer.availability_status
  from public.member_availability as answer
  join private.classmate_sessions as session on session.student_id = answer.classmate_id
  join private.classmate_accounts as account on account.id = session.student_id and account.enabled
  where char_length(p_token) = 64
    and session.token_hash = extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
    and session.expires_at > now()
  order by answer.available_date;
$$;

create or replace function public.set_classmate_availability(
  p_token text, p_date date, p_status text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_student_id text;
begin
  select session.student_id into v_student_id
  from private.classmate_sessions as session
  join private.classmate_accounts as account on account.id = session.student_id and account.enabled
  where char_length(p_token) = 64
    and session.token_hash = extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
    and session.expires_at > now()
  limit 1;

  if v_student_id is null then raise exception 'invalid session'; end if;
  if extract(isodow from p_date) not between 1 and 5
     or p_date between date '2026-08-10' and date '2026-08-17' then
    raise exception 'date is closed';
  end if;

  if p_status is null then
    delete from public.member_availability
    where classmate_id = v_student_id and available_date = p_date;
  elsif p_status in ('available', 'unavailable') then
    insert into public.member_availability (classmate_id, available_date, availability_status)
    values (v_student_id, p_date, p_status)
    on conflict (classmate_id, available_date)
    do update set availability_status = excluded.availability_status, updated_at = now();
  else
    raise exception 'invalid availability status';
  end if;
end;
$$;

revoke all on function public.classmate_availability(text) from public;
revoke all on function public.set_classmate_availability(text, date, text) from public;
grant execute on function public.classmate_availability(text) to anon, authenticated;
grant execute on function public.set_classmate_availability(text, date, text) to anon, authenticated;

comment on table public.member_approvals is 'One Discord approval request per user.';
comment on table public.member_availability is 'Per-date availability, owned by either a classmate ID or Discord user.';

notify pgrst, 'reload schema';
commit;
