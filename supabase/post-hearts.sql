-- Run after posts.sql and shared-feed.sql.
begin;

create table if not exists public.post_hearts (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.post_hearts enable row level security;
revoke all on public.post_hearts from public, anon, authenticated;
grant select, insert, delete on public.post_hearts to authenticated;

drop policy if exists "Users can read their own hearts" on public.post_hearts;
create policy "Users can read their own hearts" on public.post_hearts
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Users can heart shared posts" on public.post_hearts;
create policy "Users can heart shared posts" on public.post_hearts
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.home_feed where id = post_id)
  );

drop policy if exists "Users can remove their own hearts" on public.post_hearts;
create policy "Users can remove their own hearts" on public.post_hearts
  for delete to authenticated using (user_id = (select auth.uid()));

-- Expose aggregate counts and the caller's state, never other users' heart rows.
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
    and (select auth.uid()) is not null
    and cardinality(post_ids) <= 100
  group by p.id;
$$;

revoke all on function public.get_post_hearts(uuid[]) from public, anon;
grant execute on function public.get_post_hearts(uuid[]) to authenticated;

commit;
notify pgrst, 'reload schema';
