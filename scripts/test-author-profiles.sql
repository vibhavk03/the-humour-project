-- Disposable database fixtures; no connection to the app's Supabase project.
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create table public.profiles (id uuid primary key, first_name text, last_name text, photo_url text, private_note text);
create table public.posts (id uuid primary key, user_id uuid, caption text);
alter table public.profiles enable row level security;
alter table public.posts enable row level security;
grant select on public.profiles, public.posts to anon, authenticated;
create schema storage;
create table storage.objects (bucket_id text, name text);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant select on storage.objects to anon, authenticated;
insert into public.profiles values
 ('00000000-0000-0000-0000-000000000001','Public','Author','00000000-0000-0000-0000-000000000001/current.png','secret'),
 ('00000000-0000-0000-0000-000000000002','Private','Person','00000000-0000-0000-0000-000000000002/current.png','secret'),
 ('00000000-0000-0000-0000-000000000003','Wrong','Path','00000000-0000-0000-0000-000000000002/current.png','secret');
insert into public.posts values
 ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001','Published'),
 ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000002',null),
 ('00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000003','Published');
insert into storage.objects values
 ('photos','00000000-0000-0000-0000-000000000001/current.png'),
 ('photos','00000000-0000-0000-0000-000000000001/old.png'),
 ('photos','00000000-0000-0000-0000-000000000002/current.png'),
 ('post-images','00000000-0000-0000-0000-000000000001/current.png');
\i supabase/public-author-profiles.sql
\i supabase/public-author-profiles.sql
set role anon;
do $$ begin
 assert (select count(*) = 2 from public.author_profiles);
 assert (select count(*) = 0 from public.profiles);
 assert (select photo_url is null from public.author_profiles where first_name = 'Wrong');
 assert (select count(*) = 1 from storage.objects);
 assert (select bool_and(bucket_id = 'photos' and name = '00000000-0000-0000-0000-000000000001/current.png') from storage.objects);
 begin
  execute 'select private_note from public.author_profiles';
  raise exception 'Leaked private profile fields';
 exception when undefined_column then null;
 end;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $$ begin
 assert (select count(*) = 3 from public.author_profiles);
 assert (select count(*) = 2 from storage.objects);
end $$;
reset role;
select set_config('request.jwt.claim.sub','',false);
delete from public.posts where user_id = '00000000-0000-0000-0000-000000000001';
set role anon;
do $$ begin
 assert (select count(*) = 1 from public.author_profiles);
 assert (select count(*) = 0 from storage.objects);
end $$;
reset role;
