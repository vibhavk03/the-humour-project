#!/bin/sh
# Isolated PostgreSQL cluster; never connects to the app's Supabase database.
set -eu
trial_pg_bin="${TRIAL_PG_BIN:-/Library/PostgreSQL/18/bin}"
trial_pg_dir=$(mktemp -d /tmp/humour-trial-pg.XXXXXX)
"$trial_pg_bin/initdb" -D "$trial_pg_dir/data" -A trust --no-locale > "$trial_pg_dir/init.log"
trap '"$trial_pg_bin/pg_ctl" -D "$trial_pg_dir/data" -m fast -w stop > "$trial_pg_dir/stop.log" 2>&1 || true' EXIT
"$trial_pg_bin/pg_ctl" -D "$trial_pg_dir/data" -l "$trial_pg_dir/server.log" -o "-h '' -k $trial_pg_dir -p 55491" -w start
"$trial_pg_bin/psql" -h "$trial_pg_dir" -p 55491 -d postgres -v ON_ERROR_STOP=1 -c 'create role anon; create role authenticated;'
"$trial_pg_bin/psql" -h "$trial_pg_dir" -p 55491 -d postgres -v ON_ERROR_STOP=1 -f supabase/guest-trial.sql
# Reapplying must preserve configured limits/counters.
"$trial_pg_bin/psql" -h "$trial_pg_dir" -p 55491 -d postgres -v ON_ERROR_STOP=1 -f supabase/guest-trial.sql
"$trial_pg_bin/psql" -h "$trial_pg_dir" -p 55491 -d postgres -v ON_ERROR_STOP=1 <<'SQL'
update public.guest_trial_config set daily_limit = 5;
set role anon;
do $$
declare row record;
begin
  select * into row from public.reserve_guest_trial('../invalid');
  assert not row.allowed and row.reason = 'invalid_session';
  for i in 1..3 loop
    select * into row from public.reserve_guest_trial(repeat('a',64));
    assert row.allowed and row.remaining = 3-i;
  end loop;
  select * into row from public.reserve_guest_trial(repeat('a',64));
  assert not row.allowed and row.reason = 'session_limit';
  for i in 1..2 loop
    select * into row from public.reserve_guest_trial(repeat('b',64));
    assert row.allowed and row.remaining = 2-i;
  end loop;
  select * into row from public.reserve_guest_trial(repeat('c',64));
  assert not row.allowed and row.reason = 'daily_budget';
  begin
    perform * from public.guest_trial_usage;
    raise exception 'Guest read private quota counters';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.guest_trial_config set daily_limit = 999;
    raise exception 'Guest changed budget';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$ begin
  assert (select used = 5 from public.guest_trial_usage where quota_key='global');
  assert (select used = 3 from public.guest_trial_usage where quota_key=repeat('a',64));
  assert (select count(*)=3 from public.guest_trial_usage);
end $$;
SQL
# Concurrent callers must share the remaining two reservations, even across sessions.
"$trial_pg_bin/psql" -h "$trial_pg_dir" -p 55491 -d postgres -v ON_ERROR_STOP=1 -c 'update public.guest_trial_config set daily_limit = 7;'
trial_pids=""
for trial_n in 1 2 3 4 5 6 7 8; do
  "$trial_pg_bin/psql" -h "$trial_pg_dir" -p 55491 -d postgres -v ON_ERROR_STOP=1 -c "set role anon; select * from public.reserve_guest_trial(md5('$trial_n') || md5('$trial_n'));" > "$trial_pg_dir/request-$trial_n.log" &
  trial_pids="$trial_pids $!"
done
for trial_pid in $trial_pids; do wait "$trial_pid"; done
"$trial_pg_bin/psql" -h "$trial_pg_dir" -p 55491 -d postgres -v ON_ERROR_STOP=1 -c "do \$\$ begin assert (select used = 7 from public.guest_trial_usage where quota_key = 'global'); end \$\$;"
printf '%s\n' 'Passed SQL budget checks: migration replay, session limits, global limits, private counters, protected settings, and concurrent reservations.'
