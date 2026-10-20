#!/bin/sh
# Isolated PostgreSQL cluster; never connects to Supabase.
set -eu
vote_pg_bin="${TRIAL_PG_BIN:-/Library/PostgreSQL/18/bin}"
vote_pg_dir=$(mktemp -d /tmp/humour-votes-pg.XXXXXX)
"$vote_pg_bin/initdb" -D "$vote_pg_dir/data" -A trust --no-locale > "$vote_pg_dir/init.log"
trap '"$vote_pg_bin/pg_ctl" -D "$vote_pg_dir/data" -m fast -w stop > "$vote_pg_dir/stop.log" 2>&1 || true' EXIT
"$vote_pg_bin/pg_ctl" -D "$vote_pg_dir/data" -l "$vote_pg_dir/server.log" -o "-h '' -k $vote_pg_dir -p 55495" -w start
"$vote_pg_bin/psql" -h "$vote_pg_dir" -p 55495 -d postgres -v ON_ERROR_STOP=1 -f scripts/test-votes.sql
printf '%s\n' 'Passed vote SQL checks: like migration, replay, switching, net scores, RLS ownership, anonymous aggregates, draft protection, ranking, and cascades.'
