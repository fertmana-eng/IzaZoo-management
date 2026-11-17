-- Applied 2026-11-17 by the owner in the Supabase SQL Editor.
-- Permissions review: block functions for logged-out users and the leftover
-- staff-list function; only link your own updates to businesses; only admins
-- may post to all businesses; inactive users can't post; small clean-ups.
begin;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.get_login_users() from authenticated;
revoke execute on function public.log_problem_activity() from authenticated;
revoke execute on function public.rls_auto_enable() from authenticated;

drop policy "Users can create update business links" on public.update_businesses;
create policy "Users can create update business links" on public.update_businesses
  for insert to authenticated
  with check (
    public.is_active_user()
    and public.has_business_access(business_id)
    and exists (select 1 from public.updates_v2 u where u.id = update_id
                and (u.created_by = auth.uid() or public.can_administer()))
  );

drop policy "users can create own updates" on public.updates_v2;
alter policy "Authenticated users can create updates" on public.updates_v2
  with check (created_by = auth.uid() and public.is_active_user()
              and (all_businesses = false or public.can_administer()));
alter policy "Creator or admins can update updates" on public.updates_v2
  using (public.is_active_user() and (created_by = auth.uid() or public.can_administer()))
  with check (public.is_active_user() and (created_by = auth.uid() or public.can_administer())
              and (all_businesses = false or public.can_administer()));

alter policy "Users can edit own followups" on public.update_followups
  using (author_id = auth.uid() and public.can_access_update(update_id))
  with check (author_id = auth.uid() and public.can_access_update(update_id));

drop policy "v36 feedback insert own" on public.beta_feedback;
drop policy "v36 feedback select" on public.beta_feedback;
drop policy "v36 feedback update own" on public.beta_feedback;
alter policy "Users can create feedback" on public.beta_feedback
  with check (author_id = auth.uid() and public.is_active_user());
alter policy "Users can edit own feedback" on public.beta_feedback
  using (author_id = auth.uid() and public.is_active_user())
  with check (author_id = auth.uid() and public.is_active_user());

alter function public.close_problem(bigint) set search_path = public;
alter function public.reopen_problem(bigint) set search_path = public;
commit;
