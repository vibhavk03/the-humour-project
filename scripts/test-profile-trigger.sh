#!/bin/sh
# Isolated PostgreSQL cluster; never connects to Supabase.
set -eu
profile_pg_bin="${TRIAL_PG_BIN:-/Library/PostgreSQL/18/bin}"
profile_pg_dir=$(mktemp -d /tmp/humour-profile-pg.XXXXXX)
"$profile_pg_bin/initdb" -D "$profile_pg_dir/data" -A trust --no-locale > "$profile_pg_dir/init.log"
trap '"$profile_pg_bin/pg_ctl" -D "$profile_pg_dir/data" -m fast -w stop > "$profile_pg_dir/stop.log" 2>&1 || true' EXIT
"$profile_pg_bin/pg_ctl" -D "$profile_pg_dir/data" -l "$profile_pg_dir/server.log" -o "-h '' -k $profile_pg_dir -p 55493" -w start
"$profile_pg_bin/psql" -h "$profile_pg_dir" -p 55493 -d postgres -v ON_ERROR_STOP=1 -f scripts/test-profile-trigger.sql
printf '%s\n' 'Passed new-user trigger checks: email username default, optional surname, existing/edited names preserved, missing email fallback, length limit, and migration replay.'
