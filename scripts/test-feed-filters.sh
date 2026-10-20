#!/bin/sh
# Isolated PostgreSQL cluster; never connects to Supabase.
set -eu
filter_pg_bin="${TRIAL_PG_BIN:-/Library/PostgreSQL/18/bin}"
filter_pg_dir=$(mktemp -d /tmp/humour-filters-pg.XXXXXX)
"$filter_pg_bin/initdb" -D "$filter_pg_dir/data" -A trust --no-locale > "$filter_pg_dir/init.log"
trap '"$filter_pg_bin/pg_ctl" -D "$filter_pg_dir/data" -m fast -w stop > "$filter_pg_dir/stop.log" 2>&1 || true' EXIT
"$filter_pg_bin/pg_ctl" -D "$filter_pg_dir/data" -l "$filter_pg_dir/server.log" -o "-h '' -k $filter_pg_dir -p 55497" -w start
"$filter_pg_bin/psql" -h "$filter_pg_dir" -p 55497 -d postgres -v ON_ERROR_STOP=1 -f scripts/test-feed-filters.sql
printf '%s\n' 'Passed feed filter SQL checks: global net-score ordering, ties, owner-specific unrated filtering, cleared votes, guest restrictions, draft/context/voter privacy, and migration replay.'
