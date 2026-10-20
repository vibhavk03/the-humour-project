-- Fixtures for a disposable local database only.
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create table public.profiles (id uuid primary key references auth.users(id), first_name text, last_name text);
create function public.handle_new_user() returns trigger language plpgsql as $$
begin
  insert into public.profiles values (new.id, new.raw_user_meta_data ->> 'given_name', new.raw_user_meta_data ->> 'family_name');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
insert into auth.users values (lpad('1',32,'0')::uuid, 'existing@example.com', '{"given_name":"Existing edited name","family_name":"Surname"}');
\i supabase/default-profile-name.sql
insert into auth.users values (lpad('2',32,'0')::uuid, 'sam.student@example.com', '{"given_name":"Google given name","family_name":"Google surname"}');
insert into auth.users values (lpad('3',32,'0')::uuid, null, '{}');
insert into auth.users values (lpad('4',32,'0')::uuid, repeat('x',90) || '@example.com', '{}');
do $$ begin
  assert (select first_name = 'Existing edited name' and last_name = 'Surname' from public.profiles where id = lpad('1',32,'0')::uuid);
  assert (select first_name = 'sam.student' and last_name is null from public.profiles where id = lpad('2',32,'0')::uuid);
  assert (select first_name = 'Campus contributor' from public.profiles where id = lpad('3',32,'0')::uuid);
  assert (select length(first_name) = 80 from public.profiles where id = lpad('4',32,'0')::uuid);
end $$;
update public.profiles set first_name = 'Edited later', last_name = 'Student' where id = lpad('2',32,'0')::uuid;
\i supabase/default-profile-name.sql
update auth.users set email = 'different@example.com' where id = lpad('2',32,'0')::uuid;
do $$ begin
  assert (select first_name = 'Edited later' and last_name = 'Student' from public.profiles where id = lpad('2',32,'0')::uuid);
end $$;
