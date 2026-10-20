-- Run after profiles.sql and posts.sql. Only published authors are public.
begin;

create or replace view public.author_profiles
with (security_barrier = true, security_invoker = false) as
select profile.id, profile.first_name, profile.last_name,
  case when split_part(profile.photo_url, '/', 1) = profile.id::text
    then profile.photo_url else null end as photo_url
from public.profiles profile
where profile.id = (select auth.uid()) or exists (
  select 1 from public.posts post
  where post.user_id = profile.id and post.caption is not null
);

revoke all on public.author_profiles from public, anon, authenticated;
grant select on public.author_profiles to anon, authenticated;

-- The bucket stays private. Only the current photo of a visible author is shared.
drop policy if exists "Read visible author profile photos" on storage.objects;
create policy "Read visible author profile photos" on storage.objects
for select to anon, authenticated using (
  bucket_id = 'photos' and exists (
    select 1 from public.author_profiles author
    where author.photo_url = storage.objects.name
  )
);

commit;
notify pgrst, 'reload schema';
