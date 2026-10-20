-- Run after public-feed.sql, post-authors.sql, and post-hearts.sql.
-- Rank across ALL published posts before pagination. Only the winner is pinned;
-- all other posts keep their normal newest-first order in the app.
begin;

create or replace view public.ranked_home_feed
with (security_barrier = true, security_invoker = false) as
select feed.id, feed.user_id, feed.image_path, feed.caption, feed.created_at,
  feed.author_name,
  (coalesce(hearts.heart_count, 0) > 0 and row_number() over (
    order by coalesce(hearts.heart_count, 0) desc, feed.created_at desc, feed.id desc
  ) = 1) as is_crowd_pick
from public.home_feed feed
left join (
  select post_id, count(*) as heart_count
  from public.post_hearts
  group by post_id
) hearts on hearts.post_id = feed.id;

-- Expose only the existing public feed fields and a ranking flag, never heart rows.
revoke all on public.ranked_home_feed from public, anon, authenticated;
grant select on public.ranked_home_feed to anon, authenticated;

commit;
notify pgrst, 'reload schema';
