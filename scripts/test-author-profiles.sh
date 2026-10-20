#!/bin/sh
# Isolated PostgreSQL cluster; never connects to Supabase.
set -eu
author_pg_bin="${TRIAL_PG_BIN:-/Library/PostgreSQL/18/bin}"
author_pg_dir=$(mktemp -d /tmp/humour-authors-pg.XXXXXX)
"$author_pg_bin/initdb" -D "$author_pg_dir/data" -A trust --no-locale > "$author_pg_dir/init.log"
trap '"$author_pg_bin/pg_ctl" -D "$author_pg_dir/data" -m fast -w stop > "$author_pg_dir/stop.log" 2>&1 || true' EXIT
"$author_pg_bin/pg_ctl" -D "$author_pg_dir/data" -l "$author_pg_dir/server.log" -o "-h '' -k $author_pg_dir -p 55494" -w start
"$author_pg_bin/psql" -h "$author_pg_dir" -p 55494 -d postgres -v ON_ERROR_STOP=1 -f scripts/test-author-profiles.sql
printf '%s\n' 'Passed author privacy checks: public authors, private profiles/drafts, current photo only, owner access, mismatched paths, deleted posts, and migration replay.'
