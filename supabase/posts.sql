-- Run separately from profiles.sql in the Supabase SQL Editor.
begin;

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  image_path text not null unique,
  context text null check (char_length(context) <= 1000),
  caption text null,
  generation_prompt text null,
  prompt_version text null,
  model text null,
  created_at timestamptz not null default now(),
  constraint posts_image_owner check (
    split_part(image_path, '/', 1) = user_id::text
    and length(split_part(image_path, '/', 2)) > 0
  )
);

comment on column public.posts.image_path is
  'Private post-images bucket object path; never store expiring signed URLs.';
comment on column public.posts.caption is
  'Nullable until caption generation is implemented.';

create index if not exists posts_user_created_at_idx
  on public.posts (user_id, created_at desc, id desc);

alter table public.posts enable row level security;
revoke all on public.posts from anon;
grant select, insert, update, delete on public.posts to authenticated;

drop policy if exists "Users can read their own posts" on public.posts;
create policy "Users can read their own posts" on public.posts
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own posts" on public.posts;
create policy "Users can create their own posts" on public.posts
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own posts" on public.posts;
create policy "Users can update their own posts" on public.posts
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own posts" on public.posts;
create policy "Users can delete their own posts" on public.posts
  for delete to authenticated using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', false, 5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read their own post images" on storage.objects;
create policy "Users can read their own post images" on storage.objects
  for select to authenticated using (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can upload their own post images" on storage.objects;
create policy "Users can upload their own post images" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can delete their own post images" on storage.objects;
create policy "Users can delete their own post images" on storage.objects
  for delete to authenticated using (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

commit;
notify pgrst, 'reload schema';
