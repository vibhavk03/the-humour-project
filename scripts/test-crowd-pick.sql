-- Test fixtures for an isolated temporary database only.
create table public.posts (
  id uuid primary key, user_id uuid not null, image_path text not null,
  caption text, context text, created_at timestamptz not null
);
create table public.post_hearts (
  post_id uuid references public.posts(id) on delete cascade,
  user_id uuid not null, primary key (post_id, user_id)
);
alter table public.posts enable row level security;
alter table public.post_hearts enable row level security;
create view public.home_feed with (security_barrier = true) as
select id, user_id, image_path, caption, created_at, 'Campus contributor'::text as author_name
from public.posts where caption is not null;
grant select on public.home_feed to anon, authenticated;
insert into public.posts
select lpad(i::text, 32, '0')::uuid, lpad('99',32,'0')::uuid,
  'author/' || i || '.png', 'Caption ' || i, 'Private context',
  '2026-01-01'::timestamptz + i * interval '1 minute'
from generate_series(1,14) i;
insert into public.posts values (lpad('15',32,'0')::uuid, lpad('99',32,'0')::uuid, 'draft.png', null, 'Draft context', now());

\i supabase/crowd-pick.sql
\i supabase/crowd-pick.sql

set role anon;
do $$ begin
  assert (select count(*) = 14 from public.ranked_home_feed);
  assert (select count(*) = 0 from public.ranked_home_feed where is_crowd_pick);
  assert (select right(id::text,12)::integer = 14 from public.ranked_home_feed order by is_crowd_pick desc, created_at desc, id desc limit 1);
  begin
    perform * from public.post_hearts;
    raise exception 'Anonymous access exposed individual hearts';
  exception when insufficient_privilege then null;
  end;
  begin
    execute 'select context from public.ranked_home_feed';
    raise exception 'Ranked feed exposed private context';
  exception when undefined_column then null;
  end;
end $$;
reset role;

-- The oldest post beats a newer runner-up, even though it was outside page one.
insert into public.post_hearts
select lpad('1',32,'0')::uuid, lpad(i::text,32,'0')::uuid from generate_series(100,102) i;
insert into public.post_hearts
select lpad('2',32,'0')::uuid, lpad(i::text,32,'0')::uuid from generate_series(100,101) i;
set role anon;
do $$
declare first_page integer[]; second_page integer[];
begin
  assert (select count(*) = 1 from public.ranked_home_feed where is_crowd_pick);
  first_page := array(select right(id::text,12)::integer from public.ranked_home_feed order by is_crowd_pick desc, created_at desc, id desc limit 12);
  second_page := array(select right(id::text,12)::integer from public.ranked_home_feed order by is_crowd_pick desc, created_at desc, id desc limit 12 offset 12);
  assert first_page = array[1,14,13,12,11,10,9,8,7,6,5,4];
  assert second_page = array[3,2];
  assert (select count(distinct id) = 14 from unnest(first_page || second_page) id);
end $$;
reset role;

-- Ties favor the newer timestamp, then UUID, without promoting all popular posts.
insert into public.post_hearts values (lpad('2',32,'0')::uuid, lpad('102',32,'0')::uuid);
do $$ begin
  assert (select right(id::text,12)::integer = 2 from public.ranked_home_feed where is_crowd_pick);
end $$;
update public.posts set created_at = '2026-01-01' where id in (lpad('1',32,'0')::uuid, lpad('2',32,'0')::uuid);
do $$ begin
  assert (select right(id::text,12)::integer = 2 from public.ranked_home_feed where is_crowd_pick);
end $$;
delete from public.posts where id = lpad('2',32,'0')::uuid;
do $$ begin
  assert (select right(id::text,12)::integer = 1 from public.ranked_home_feed where is_crowd_pick);
end $$;
delete from public.post_hearts;
do $$ begin
  assert (select count(*) = 0 from public.ranked_home_feed where is_crowd_pick);
end $$;
