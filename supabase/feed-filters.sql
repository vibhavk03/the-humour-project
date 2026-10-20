-- Run after public-feed.sql and post-votes.sql. No private voter rows are shared.
begin;
create or replace view public.scored_home_feed
with (security_barrier = true, security_invoker = false) as
select feed.id, feed.user_id, feed.image_path, feed.caption, feed.created_at, feed.author_name,
  coalesce(votes.score, 0)::bigint as vote_score
from public.home_feed feed
left join (
  select post_id, sum(vote) as score from public.post_hearts group by post_id
) votes on votes.post_id = feed.id;
revoke all on public.scored_home_feed from public, anon, authenticated;
grant select on public.scored_home_feed to anon, authenticated;

create or replace view public.unrated_home_feed
with (security_barrier = true, security_invoker = false) as
select feed.id, feed.user_id, feed.image_path, feed.caption, feed.created_at, feed.author_name
from public.home_feed feed
where (select auth.uid()) is not null and not exists (
  select 1 from public.post_hearts vote
  where vote.post_id = feed.id and vote.user_id = (select auth.uid())
);
revoke all on public.unrated_home_feed from public, anon, authenticated;
grant select on public.unrated_home_feed to authenticated;
commit;
notify pgrst, 'reload schema';
