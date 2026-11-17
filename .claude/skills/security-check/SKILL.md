---
name: security-check
description: Security check for IzaZoo changes that touch data, logins, permissions, the database or the admin-users edge function. Use before merging such a change, or when the owner types /security-check.
---

# Security check

Work in plain, non-technical language for the owner (see CLAUDE.md). Read only;
never change the database without the owner's OK (CLAUDE.md explains how
database changes are applied: SQL the owner runs in the SQL Editor).

Supabase project id: `ocfbgppfpvjfhclpdtao`. The permission model is described
in CLAUDE.md (owner / full admin / limited admin / manager).

1. **Automatic advisor:** run Supabase's security advisor. The known, accepted
   warnings are "security definer function executable" for the app's own
   functions (they check the caller themselves) and "leaked password
   protection" (needs a paid plan). Anything else is new: investigate.
2. **Every table has row-level security on**, and no table or function is
   reachable without logging in (anon has no table grants and no EXECUTE).
3. **Role-simulated tests** (read-only, inside a transaction that is rolled
   back, e.g. a DO block that ends with `raise exception` carrying the
   results): as the manager user, check they can do their normal work (own
   business problems, tasks, updates, replies) and cannot see or change other
   businesses' data, post to all businesses, or perform admin actions. Repeat
   for anything the change touched.
4. **Test every write the app does, as a real user, exactly as the app does it.**
   The tests in `tests/` use a fake database with no access rules, so they can't
   catch a rule that refuses the app's own writes. For each insert/update the
   change adds or touches, run it in the rolled-back DO block as the owner (and
   as the role that should be allowed), including `returning` when the app reads
   the row back (`.select()` after `.insert()`), and any follow-up rows (e.g.
   business links). It must succeed for those roles and fail for the others.
   (Avoid UPDATE/DELETE in these blocks: they trigger a confirmation prompt that
   times out; check those rules by reading the policy.)
   Access has two layers: the table permission (`grant select/insert/update/
   delete ... to authenticated`, see `information_schema.role_table_grants`) and
   then the row rules (policies). A policy does nothing without the matching
   table permission, so for every operation the app performs check both.
5. **Edge function** `admin-users`: compare the deployed code with
   `supabase/functions/admin-users/Index.ts`; admin actions must be allowed only
   for the owner or an admin with access to all businesses.
6. **App code:** no passwords, keys (other than the publishable key) or user
   lists in `index.html`; anything built from user text goes through `esc()`.
7. Keep `supabase/` in step: if a database change or function deploy happened,
   save it there.
8. Report in plain language: what was checked, anything found, and what you
   propose (ask before applying).
