#!/bin/sh
# Isolated PostgreSQL cluster; never connects to the app's Supabase database.
set -eu
crowd_pg_bin="${TRIAL_PG_BIN:-/Library/PostgreSQL/18/bin}"
crowd_pg_dir=$(mktemp -d /tmp/humour-crowd-pg.XXXXXX)
"$crowd_pg_bin/initdb" -D "$crowd_pg_dir/data" -A trust --no-locale > "$crowd_pg_dir/init.log"
trap '"$crowd_pg_bin/pg_ctl" -D "$crowd_pg_dir/data" -m fast -w stop > "$crowd_pg_dir/stop.log" 2>&1 || true' EXIT
"$crowd_pg_bin/pg_ctl" -D "$crowd_pg_dir/data" -l "$crowd_pg_dir/server.log" -o "-h '' -k $crowd_pg_dir -p 55492" -w start
"$crowd_pg_bin/psql" -h "$crowd_pg_dir" -p 55492 -d postgres -v ON_ERROR_STOP=1 -c 'create role anon; create role authenticated;'
"$crowd_pg_bin/psql" -h "$crowd_pg_dir" -p 55492 -d postgres -v ON_ERROR_STOP=1 -f scripts/test-crowd-pick.sql
printf '%s\n' 'Passed Crowd Pick SQL checks: global ranking, zero likes, ties, pagination without duplicates, deleted winner, public reads, and private field/heart restrictions.'
