-- Permanent delete of knowledge documents (owner's request): owner and full
-- administrators only. Business links and recorded versions are removed with
-- the item (their foreign keys cascade); the app deletes the file from storage.
-- Run by the owner in the Supabase SQL Editor.
create policy "Admins can delete knowledge" on public.knowledge_items
  for delete to authenticated using (public.can_administer());

-- The table also needs the basic DELETE permission for signed-in users; the
-- rule above then limits it to the owner and full administrators. (Applied
-- separately on 2026-11-17 after the first delete attempt was refused.)
grant delete on table public.knowledge_items to authenticated;
