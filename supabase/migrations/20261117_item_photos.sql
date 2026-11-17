-- Photos on problems and tasks (up to 5 each).
-- Applied through the Supabase connector (adds only; nothing is dropped or replaced).
-- Access follows the problem/task itself: whoever can see it sees its photos,
-- whoever can edit it (active user with access to its business) adds or removes them.

-- 1. Which photos belong to which problem or task.
create table public.item_photos (
  id bigint generated always as identity primary key,
  problem_id bigint references public.problems(id) on delete cascade,
  task_id bigint references public.tasks(id) on delete cascade,
  file_path text not null unique,   -- the photo (about 1600 px, JPEG)
  thumb_path text not null unique,  -- a small copy for the lists
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint item_photos_one_parent check ((problem_id is null) <> (task_id is null))
);
create index item_photos_problem_idx on public.item_photos(problem_id) where problem_id is not null;
create index item_photos_task_idx on public.item_photos(task_id) where task_id is not null;
alter table public.item_photos enable row level security;

-- may the current user see / change this problem or task? (false if it does not exist)
create function public.photo_parent_allowed(p_problem_id bigint, p_task_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select public.has_business_access(b) from (select coalesce(
      (select business_id from public.problems where id = p_problem_id),
      (select business_id from public.tasks where id = p_task_id)) as b) x
    where b is not null), false);
$$;
-- may the current user see / change the photos stored at this path?
-- paths look like problem/<id>/<name>.jpg or task/<id>/<name>.jpg
create function public.photo_path_allowed(path text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when split_part(path, '/', 2) !~ '^[0-9]{1,18}$' then false
    when split_part(path, '/', 1) = 'problem' then
      public.photo_parent_allowed(split_part(path, '/', 2)::bigint, null)
    when split_part(path, '/', 1) = 'task' then
      public.photo_parent_allowed(null, split_part(path, '/', 2)::bigint)
    else false end;
$$;
revoke execute on function public.photo_parent_allowed(bigint, bigint) from public, anon;
revoke execute on function public.photo_path_allowed(text) from public, anon;
grant execute on function public.photo_parent_allowed(bigint, bigint) to authenticated;
grant execute on function public.photo_path_allowed(text) to authenticated;

-- at most 5 photos per problem or task
create function public.item_photos_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.item_photos
      where (new.problem_id is not null and problem_id = new.problem_id)
         or (new.task_id is not null and task_id = new.task_id)) >= 5 then
    raise exception 'אפשר לצרף עד 5 תמונות';
  end if;
  return new;
end $$;
revoke execute on function public.item_photos_limit() from public, anon;
create trigger item_photos_limit before insert on public.item_photos
  for each row execute function public.item_photos_limit();

-- both permission layers: table permission and row rules
grant select, insert, delete on table public.item_photos to authenticated;
create policy "photos: view with the problem or task" on public.item_photos
  for select to authenticated
  using (public.photo_parent_allowed(problem_id, task_id));
create policy "photos: add to a problem or task you can edit" on public.item_photos
  for insert to authenticated
  with check (created_by = auth.uid()
    and public.photo_parent_allowed(problem_id, task_id)
    and file_path like (case when problem_id is not null then 'problem/' || problem_id else 'task/' || task_id end) || '/%'
    and thumb_path like (case when problem_id is not null then 'problem/' || problem_id else 'task/' || task_id end) || '/%');
create policy "photos: remove from a problem or task you can edit" on public.item_photos
  for delete to authenticated
  using (public.photo_parent_allowed(problem_id, task_id));

-- 2. A private file store for the photos: JPEG only, at most 2 MB each
--    (the app shrinks photos on the phone to about 300 KB before uploading).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 2097152, array['image/jpeg']);

create policy "photos files: read with the problem or task" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and public.photo_path_allowed(name));
create policy "photos files: upload to a problem or task you can edit" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and public.photo_path_allowed(name));
create policy "photos files: remove from a problem or task you can edit" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and public.photo_path_allowed(name));
