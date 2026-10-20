-- Local disposable database only; never connects to the app's Supabase project.
create role anon; create role authenticated;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
grant usage on schema auth to anon,authenticated;
grant execute on function auth.uid() to anon,authenticated;
insert into auth.users select lpad(i::text,32,'0')::uuid from generate_series(1,3) i;
create table public.posts (id uuid primary key,user_id uuid references auth.users(id) on delete cascade,image_path text,caption text,context text,created_at timestamptz);
alter table public.posts enable row level security;
grant select on public.posts to anon,authenticated;
insert into public.posts values
 (lpad('11',32,'0')::uuid,lpad('1',32,'0')::uuid,'old.png','Old hit','private','2026-01-01'),
 (lpad('12',32,'0')::uuid,lpad('2',32,'0')::uuid,'new.png','New hit','private','2026-02-01'),
 (lpad('13',32,'0')::uuid,lpad('1',32,'0')::uuid,'draft.png',null,'private','2026-03-01');
create view public.home_feed with (security_barrier=true) as
 select id,user_id,image_path,caption,created_at,'Author'::text as author_name from public.posts where caption is not null;
grant select on public.home_feed to anon,authenticated;
\i supabase/post-hearts.sql
\i supabase/crowd-pick.sql
-- Existing likes before migration.
insert into public.post_hearts(post_id,user_id) values
 (lpad('11',32,'0')::uuid,lpad('1',32,'0')::uuid),
 (lpad('11',32,'0')::uuid,lpad('2',32,'0')::uuid),
 (lpad('12',32,'0')::uuid,lpad('3',32,'0')::uuid);
\i supabase/post-votes.sql
\i supabase/post-votes.sql
set role anon;
do $$ begin
 assert (select score=2 and user_vote=0 from public.get_post_votes(array[lpad('11',32,'0')::uuid]));
 assert (select right(id::text,12)::int=11 from public.ranked_home_feed where is_crowd_pick);
 assert (select count(*)=0 from public.get_post_votes(array[lpad('13',32,'0')::uuid]));
 assert (select count(*)=0 from public.get_post_votes(array_fill(lpad('11',32,'0')::uuid,array[101])));
 begin
  perform * from public.post_hearts;
  raise exception 'Anonymous caller read individual votes';
 exception when insufficient_privilege then null;
 end;
 begin
  insert into public.post_hearts(post_id,user_id,vote) values(lpad('12',32,'0')::uuid,lpad('1',32,'0')::uuid,1);
  raise exception 'Anonymous caller wrote a vote';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub',lpad('1',32,'0')::uuid::text,false);
-- Upsert must support switching, not add a second vote.
insert into public.post_hearts(post_id,user_id,vote) values(lpad('11',32,'0')::uuid,lpad('1',32,'0')::uuid,-1)
on conflict(post_id,user_id) do update set vote=excluded.vote;
do $$ begin
 assert (select score=0 and user_vote=-1 from public.get_post_votes(array[lpad('11',32,'0')::uuid]));
 assert (select count(*)=1 from public.post_hearts);
 assert (select right(id::text,12)::int=12 from public.ranked_home_feed where is_crowd_pick);
 begin
  insert into public.post_hearts(post_id,user_id,vote) values(lpad('12',32,'0')::uuid,lpad('2',32,'0')::uuid,1);
  raise exception 'Spoofed another voter';
 exception when insufficient_privilege then null;
 end;
 begin
  insert into public.post_hearts(post_id,user_id,vote) values(lpad('13',32,'0')::uuid,lpad('1',32,'0')::uuid,1);
  raise exception 'Voted on unpublished post';
 exception when insufficient_privilege then null;
 end;
 begin
  update public.post_hearts set vote=0;
  raise exception 'Accepted an invalid vote';
 exception when check_violation then null;
 end;
end $$;
-- Updates and removals cannot touch another user's row.
update public.post_hearts set vote=-1 where user_id=lpad('2',32,'0')::uuid;
delete from public.post_hearts where user_id=lpad('2',32,'0')::uuid;
do $$ begin
 assert (select score=0 from public.get_post_votes(array[lpad('11',32,'0')::uuid]));
end $$;
delete from public.post_hearts where post_id=lpad('11',32,'0')::uuid and user_id=(select auth.uid());
delete from public.post_hearts where post_id=lpad('11',32,'0')::uuid and user_id=(select auth.uid());
do $$ begin
 assert (select score=1 and user_vote=0 from public.get_post_votes(array[lpad('11',32,'0')::uuid]));
 -- Tied scores favor the newer post.
 assert (select right(id::text,12)::int=12 from public.ranked_home_feed where is_crowd_pick);
end $$;
reset role;
-- Negative and zero scores never get the featured badge.
update public.post_hearts set vote=-1;
set role anon;
do $$ begin
 assert (select bool_and(score=-1 and user_vote=0) from public.get_post_votes(array[lpad('11',32,'0')::uuid,lpad('12',32,'0')::uuid]));
 assert (select count(*)=0 from public.ranked_home_feed where is_crowd_pick);
end $$;
reset role;
delete from public.posts where id=lpad('11',32,'0')::uuid;
do $$ begin
 assert (select count(*)=0 from public.post_hearts where post_id=lpad('11',32,'0')::uuid);
end $$;
delete from auth.users where id=lpad('3',32,'0')::uuid;
do $$ begin
 assert (select count(*)=0 from public.post_hearts);
end $$;
