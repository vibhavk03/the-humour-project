-- Run after the existing posts setup. No service-role key is required by the app.
-- Atomic reservations keep the shared LLM budget across all app instances.
begin;

create table if not exists public.guest_trial_config (
  id boolean primary key default true check (id),
  daily_limit integer not null default 100 check (daily_limit between 0 and 1000),
  session_limit integer not null default 3 check (session_limit between 0 and 10)
);
insert into public.guest_trial_config (id) values (true) on conflict do nothing;

create table if not exists public.guest_trial_usage (
  usage_date date not null,
  quota_key text not null,
  used integer not null default 0 check (used >= 0),
  primary key (usage_date, quota_key)
);

alter table public.guest_trial_config enable row level security;
alter table public.guest_trial_usage enable row level security;
revoke all on public.guest_trial_config, public.guest_trial_usage from public, anon, authenticated;

create or replace function public.reserve_guest_trial(guest_key text)
returns table (allowed boolean, reason text, remaining integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'UTC')::date;
  total_used integer;
  guest_used integer;
  daily_cap integer;
  session_cap integer;
begin
  if guest_key is null or guest_key !~ '^[0-9a-f]{64}$' then
    return query select false, 'invalid_session'::text, 0;
    return;
  end if;
  select daily_limit, session_limit into daily_cap, session_cap
    from public.guest_trial_config where id = true;
  if daily_cap is null or session_cap is null then
    return query select false, 'disabled'::text, 0;
    return;
  end if;

  insert into public.guest_trial_usage values (today, 'global', 0) on conflict do nothing;
  -- Serialize all reservations for this UTC day before checking either counter.
  select used into total_used from public.guest_trial_usage
    where usage_date = today and quota_key = 'global' for update;
  select coalesce((select used from public.guest_trial_usage
    where usage_date = today and quota_key = guest_key), 0) into guest_used;
  if total_used >= daily_cap then
    return query select false, 'daily_budget'::text, 0;
    return;
  end if;
  if guest_used >= session_cap then
    return query select false, 'session_limit'::text, 0;
    return;
  end if;

  update public.guest_trial_usage set used = used + 1
    where usage_date = today and quota_key = 'global';
  insert into public.guest_trial_usage values (today, guest_key, 1)
    on conflict (usage_date, quota_key) do update set used = public.guest_trial_usage.used + 1;
  delete from public.guest_trial_usage where usage_date < today - 2;
  return query select true, 'reserved'::text, least(session_cap - guest_used - 1, daily_cap - total_used - 1);
end;
$$;

-- Callers can only consume reservations. They cannot increase limits, reset
-- counters, or read another visitor's usage. Guessing keys cannot increase spend.
revoke all on function public.reserve_guest_trial(text) from public, anon, authenticated;
grant execute on function public.reserve_guest_trial(text) to anon, authenticated;
commit;
notify pgrst, 'reload schema';
