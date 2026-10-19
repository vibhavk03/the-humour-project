-- Run LAST, after shared-feed.sql, post-authors.sql, and post-hearts.sql.
-- Published posts are public. Base posts, profiles, drafts, and context keep their RLS.
begin;

create or replace view public.home_feed
with (security_barrier = true, security_invoker = false) as
select posts.id, posts.user_id, posts.image_path, posts.caption, posts.created_at,
  nullif(trim(concat_ws(' ',
    nullif(trim(profiles.first_name), ''),
    nullif(trim(profiles.last_name), '')
  )), '') as author_name
from public.posts
left join public.profiles on profiles.id = posts.user_id
where posts.caption is not null;

revoke all on public.home_feed from public, anon, authenticated;
grant select on public.home_feed to anon, authenticated;

-- Keep the bucket private; guests can only sign images of published posts.
create or replace function public.can_read_shared_post_image(object_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.posts
    where image_path = object_path and caption is not null
  );
$$;

revoke all on function public.can_read_shared_post_image(text) from public, anon, authenticated;
grant execute on function public.can_read_shared_post_image(text) to anon, authenticated;

drop policy if exists "Users can read shared post images" on storage.objects;
create policy "Users can read shared post images" on storage.objects
  for select to anon, authenticated using (
    bucket_id = 'post-images'
    and public.can_read_shared_post_image(name)
  );

-- Expose only aggregate counts and the caller's own state, never individual hearts.
create or replace function public.get_post_hearts(post_ids uuid[])
returns table (post_id uuid, heart_count bigint, hearted boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, count(h.user_id), coalesce(bool_or(h.user_id = (select auth.uid())), false)
  from public.posts p
  left join public.post_hearts h on h.post_id = p.id
  where p.id = any(post_ids)
    and p.caption is not null
    and cardinality(post_ids) <= 100
  group by p.id;
$$;

revoke all on function public.get_post_hearts(uuid[]) from public, anon, authenticated;
grant execute on function public.get_post_hearts(uuid[]) to anon, authenticated;

-- Heart writes remain authenticated and governed by the existing owner policies.
commit;
notify pgrst, 'reload schema';
