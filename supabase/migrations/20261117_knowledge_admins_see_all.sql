-- Fix: the owner and full admins could not add documents. The app saves a new
-- item and reads it back (INSERT ... RETURNING) before linking it to businesses;
-- the read rule required those links, so every insert was refused.
-- Administrators now see every knowledge item; everyone else as before.
-- Run by the owner in the Supabase SQL Editor.
alter policy "Users can view allowed knowledge" on public.knowledge_items
  using (public.can_administer() or (public.can_access_knowledge(id) and not is_archived));
