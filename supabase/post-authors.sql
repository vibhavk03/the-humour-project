-- Run after profiles.sql, posts.sql, and shared-feed.sql.
-- Include author names in the same query as posts, never full profiles.
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
where posts.caption is not null and (select auth.uid()) is not null;

revoke all on public.home_feed from public, anon, authenticated;
grant select on public.home_feed to authenticated;

-- Invoker permissions preserve owner-only posts/profile RLS for private context.
create or replace view public.user_feed
with (security_barrier = true, security_invoker = true) as
select posts.id, posts.user_id, posts.image_path, posts.context, posts.caption,
  posts.created_at,
  nullif(trim(concat_ws(' ',
    nullif(trim(profiles.first_name), ''),
    nullif(trim(profiles.last_name), '')
  )), '') as author_name
from public.posts
left join public.profiles on profiles.id = posts.user_id
where posts.user_id = (select auth.uid());

revoke all on public.user_feed from public, anon, authenticated;
grant select on public.user_feed to authenticated;

commit;
notify pgrst, 'reload schema';
