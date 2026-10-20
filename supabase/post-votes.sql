-- Run LAST after public-feed.sql and crowd-pick.sql.
-- Extend the existing table in place: every existing like becomes an upvote.
begin;

alter table public.post_hearts add column if not exists vote smallint not null default 1;
alter table public.post_hearts drop constraint if exists post_hearts_vote_check;
alter table public.post_hearts add constraint post_hearts_vote_check check (vote in (-1, 1));
grant update on public.post_hearts to authenticated;

drop policy if exists "Users can change their own vote" on public.post_hearts;
create policy "Users can change their own vote" on public.post_hearts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.home_feed where id = post_id)
  );
-- Existing insert, select, and delete RLS policies continue to restrict ownership.

create or replace function public.get_post_votes(post_ids uuid[])
returns table (post_id uuid, score bigint, user_vote smallint)
language sql stable security definer set search_path = '' as $$
  select post.id, coalesce(sum(votes.vote), 0)::bigint,
    coalesce(max(votes.vote) filter (where votes.user_id = (select auth.uid())), 0)::smallint
  from public.posts post
  left join public.post_hearts votes on votes.post_id = post.id
  where post.id = any(post_ids) and post.caption is not null
    and cardinality(post_ids) <= 100
  group by post.id;
$$;
revoke all on function public.get_post_votes(uuid[]) from public, anon, authenticated;
grant execute on function public.get_post_votes(uuid[]) to anon, authenticated;

create or replace view public.ranked_home_feed
with (security_barrier = true, security_invoker = false) as
select feed.id, feed.user_id, feed.image_path, feed.caption, feed.created_at, feed.author_name,
  (coalesce(votes.score, 0) > 0 and row_number() over (
    order by coalesce(votes.score, 0) desc, feed.created_at desc, feed.id desc
  ) = 1) as is_crowd_pick
from public.home_feed feed
left join (
  select post_id, sum(vote) as score from public.post_hearts group by post_id
) votes on votes.post_id = feed.id;
revoke all on public.ranked_home_feed from public, anon, authenticated;
grant select on public.ranked_home_feed to anon, authenticated;

commit;
notify pgrst, 'reload schema';
