-- Knowledge as a document library (PDF files, more types later).
-- Run by the owner in the Supabase SQL Editor.
begin;

-- 1. Each knowledge item can hold one file; the text body becomes optional.
alter table public.knowledge_items
  alter column body drop not null,
  alter column body set default '',
  add column if not exists file_path text,
  add column if not exists file_name text,
  add column if not exists file_type text,
  add column if not exists file_size bigint;
create unique index if not exists knowledge_items_file_path_key
  on public.knowledge_items(file_path) where file_path is not null;

-- previous versions: body optional, remember the previous file name
alter table public.knowledge_versions
  alter column body drop not null,
  add column if not exists file_name text;

-- 2. Archived items are visible to administrators only.
alter policy "Users can view allowed knowledge" on public.knowledge_items
  using (public.can_access_knowledge(id) and (not is_archived or public.can_administer()));

-- 3. A private file store for the documents: PDF only, at most 20 MB per file.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('knowledge', 'knowledge', false, 20971520, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 4. Who may do what with the files.
-- Read: administrators, or anyone with access to the (non-archived) item the file belongs to.
create policy "knowledge files: read if allowed" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'knowledge'
    and (
      public.can_administer()
      or exists (
        select 1 from public.knowledge_items k
        where k.file_path = objects.name
          and not k.is_archived
          and public.can_access_knowledge(k.id)
      )
    )
  );
-- Upload, replace, delete: owner and full administrators only.
create policy "knowledge files: admins upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'knowledge' and public.can_administer());
create policy "knowledge files: admins update" on storage.objects
  for update to authenticated
  using (bucket_id = 'knowledge' and public.can_administer())
  with check (bucket_id = 'knowledge' and public.can_administer());
create policy "knowledge files: admins delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'knowledge' and public.can_administer());

commit;
