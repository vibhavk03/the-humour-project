create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
grant usage on schema auth to anon,authenticated;
create table public.posts(id uuid primary key,user_id uuid,image_path text,caption text,context text,created_at timestamptz);
create table public.post_hearts(post_id uuid references public.posts(id),user_id uuid,vote smallint,primary key(post_id,user_id));
alter table public.posts enable row level security;
alter table public.post_hearts enable row level security;
create view public.home_feed with(security_barrier=true) as select id,user_id,image_path,caption,created_at,'Sam'::text as author_name from public.posts where caption is not null;
grant select on public.home_feed to anon,authenticated;
insert into public.posts select lpad(i::text,32,'0')::uuid,lpad('99',32,'0')::uuid,i||'.png','Caption '||i,'private context','2026-01-01'::timestamptz+i*interval '1 minute' from generate_series(1,15)i;
insert into public.posts values(lpad('16',32,'0')::uuid,lpad('99',32,'0')::uuid,'draft.png',null,'private','2026-02-01');
insert into public.post_hearts values
 (lpad('1',32,'0')::uuid,lpad('101',32,'0')::uuid,1),
 (lpad('1',32,'0')::uuid,lpad('102',32,'0')::uuid,1),
 (lpad('1',32,'0')::uuid,lpad('103',32,'0')::uuid,-1),
 (lpad('2',32,'0')::uuid,lpad('101',32,'0')::uuid,-1),
 (lpad('3',32,'0')::uuid,lpad('102',32,'0')::uuid,1);
\i supabase/feed-filters.sql
\i supabase/feed-filters.sql
set role anon;
do $$ begin
 assert (select count(*)=15 from public.scored_home_feed);
 assert (select vote_score=1 from public.scored_home_feed where id=lpad('1',32,'0')::uuid);
 assert (select vote_score=-1 from public.scored_home_feed where id=lpad('2',32,'0')::uuid);
 assert (array(select right(id::text,12)::int from public.scored_home_feed order by vote_score desc,created_at desc,id desc limit 2)=array[3,1]),'Highest score globally, newest timestamp for ties';
 begin
  perform * from public.unrated_home_feed;
  raise exception 'Guest accessed personal voting filter';
 exception when insufficient_privilege then null;
 end;
 begin
  execute 'select context from public.scored_home_feed';
  raise exception 'Context exposed';
 exception when undefined_column then null;
 end;
 begin
  perform * from public.post_hearts;
  raise exception 'Individual votes exposed';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub',lpad('101',32,'0')::uuid::text,false);
do $$ begin
 assert (select count(*)=13 from public.unrated_home_feed);
 assert not exists(select 1 from public.unrated_home_feed where id in(lpad('1',32,'0')::uuid,lpad('2',32,'0')::uuid)), 'Exclude both upvotes and downvotes';
 assert exists(select 1 from public.unrated_home_feed where id=lpad('3',32,'0')::uuid),'Other people voting does not hide a post';
end $$;
select set_config('request.jwt.claim.sub',lpad('102',32,'0')::uuid::text,false);
do $$ begin
 assert not exists(select 1 from public.unrated_home_feed where id in(lpad('1',32,'0')::uuid,lpad('3',32,'0')::uuid));
 assert exists(select 1 from public.unrated_home_feed where id=lpad('2',32,'0')::uuid);
end $$;
reset role;
delete from public.post_hearts where post_id=lpad('1',32,'0')::uuid and user_id=lpad('101',32,'0')::uuid;
set role authenticated;
select set_config('request.jwt.claim.sub',lpad('101',32,'0')::uuid::text,false);
do $$ begin
 assert exists(select 1 from public.unrated_home_feed where id=lpad('1',32,'0')::uuid),'Clearing a vote returns a post to Not rated';
 assert (select count(*)=14 from public.unrated_home_feed);
end $$;
select set_config('request.jwt.claim.sub','',false);
do $$ begin
 assert (select count(*)=0 from public.unrated_home_feed),'No session yields no personal results';
end $$;
reset role;
