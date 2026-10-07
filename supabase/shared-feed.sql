-- Run after posts.sql. Generated images/captions become readable by signed-in users.
-- Keep posts RLS owner-only: private context and generation metadata stay protected.
begin;

create index if not exists posts_shared_created_at_idx
  on public.posts (created_at desc, id desc) where caption is not null;

-- This deliberately uses the view owner's permissions to read across users.
-- Only the listed shared fields are exposed; never add context or prompt here.
create or replace view public.home_feed
with (security_barrier = true, security_invoker = false) as
select id, user_id, image_path, caption, created_at
from public.posts
where caption is not null and (select auth.uid()) is not null;

revoke all on public.home_feed from public, anon, authenticated;
grant select on public.home_feed to authenticated;

-- The storage policy needs to check shared posts without owner-only posts RLS.
create or replace function public.can_read_shared_post_image(object_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.posts
    where image_path = object_path and caption is not null
  );
$$;

revoke all on function public.can_read_shared_post_image(text) from public, anon;
grant execute on function public.can_read_shared_post_image(text) to authenticated;

drop policy if exists "Users can read shared post images" on storage.objects;
create policy "Users can read shared post images" on storage.objects
  for select to authenticated using (
    bucket_id = 'post-images'
    and public.can_read_shared_post_image(name)
  );

-- Existing insert/update/delete policies stay owner-only. The bucket stays private.
commit;
notify pgrst, 'reload schema';
