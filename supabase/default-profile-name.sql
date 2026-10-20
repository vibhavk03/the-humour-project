-- Run once after profiles.sql. Only future new accounts receive this default;
-- existing profile names and user edits are preserved.
begin;
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, first_name, last_name)
  values (
    new.id,
    coalesce(nullif(left(btrim(split_part(coalesce(new.email, ''), '@', 1)), 80), ''), 'Campus contributor'),
    null
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
commit;
