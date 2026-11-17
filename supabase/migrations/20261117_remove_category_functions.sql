-- Remove the category administration functions: the owner decided the 7
-- knowledge categories stay fixed, and the app no longer calls these.
-- Nothing else in the database uses them (checked 2026-11-17).
-- Run by the owner in the Supabase SQL Editor.
drop function public.admin_create_knowledge_category(text, integer);
drop function public.admin_update_knowledge_category(bigint, text, integer, boolean);
