-- Permanent delete of knowledge documents (owner's request): owner and full
-- administrators only. Business links and recorded versions are removed with
-- the item (their foreign keys cascade); the app deletes the file from storage.
-- Run by the owner in the Supabase SQL Editor.
create policy "Admins can delete knowledge" on public.knowledge_items
  for delete to authenticated using (public.can_administer());
