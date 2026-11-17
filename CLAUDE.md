# IzaZoo – notes for Claude

## About the owner (how to work with them)

- The owner does not write code and relies on Claude for all technical work.
  Explain things in plain, non-technical language. Avoid jargon; when a technical
  term is unavoidable, say what it means.
- **Act, then inform.** Claude may push, open pull requests and merge them into
  `main` without asking first, then tell the owner what was done and how to test it
  on their phone. Still ask before anything that cannot be undone, such as deleting
  data or changing the database.
- **Model:** the owner is on the Pro plan and no longer has Fable (the trial
  ended). Use Opus for everything. For hard or risky work (security, large
  restructures, the CSS cleanup), compensate by working in small steps, testing
  each one (before/after screenshots for visual changes), and asking the owner to
  check each step on their phone.
- **Say up front when something can't be done.** If a request runs into a browser
  or platform rule that code can't change, say so before writing code, and offer
  the best alternative. (Example below: a web app cannot close itself.)
- **Keep this file up to date.** Whenever something worth remembering happens (a fix
  merged, a decision made, a new rule from the owner, a lesson learned, the next
  steps changing), update this file and merge it, so a new session can continue
  without losing progress.
- **Always show the app link when asking the owner to test something:**
  https://fertmana-eng.github.io/IzaZoo-management/

## The app

- A single-page Hebrew (RTL) management app for the IzaZoo businesses: problems
  (תקלות), tasks (משימות), updates (עדכונים), knowledge (ידע ונהלים, still closed),
  an admin screen and user feedback.
- Everything is in `index.html` (one style block of roughly 70 KB, then the JS). `sw.js` is the
  service worker; `vendor/supabase.js` is a bundled copy of supabase-js v2.119.0.
  Bump the cache name in `sw.js` when you change files it caches.
- Backend: Supabase (auth with `<username>@izazoo.local`, tables, RPCs and an
  `admin-users` edge function). Only the publishable key is in the page.
- Published with GitHub Pages from `main`:
  https://fertmana-eng.github.io/IzaZoo-management/
  A merge goes live about 2 minutes later; the app must be fully closed and
  reopened on the phone to pick up a new version.
- Supabase project id: `ocfbgppfpvjfhclpdtao`. A Supabase connector may be
  available to Claude. Its confirmation prompts for database changes do not reach
  the owner's phone and time out; instead give the owner the SQL to paste into the
  dashboard's SQL Editor and press Run. Read-only queries and edge-function
  deploys work through the connector.
- Copies of server-side code are kept in `supabase/`: the `admin-users` edge
  function (`supabase/functions/admin-users/Index.ts`) and applied database
  changes (`supabase/migrations/`). Keep them in step with what is deployed.
- Permission model: owner = everything. Admin with "all businesses" = full admin.
  Admin limited to some businesses = treated like a manager (no admin screen, no
  admin actions, in the database and in the edge function). Manager = only their
  businesses. Only full admins may post updates to all businesses.
- The Supabase project is on a plan that pauses after inactivity. If the app shows
  "אין תשובה משרת הנתונים", check whether the project is paused and restore it in
  the Supabase dashboard.

## Browser rules that code cannot change

- **A web app cannot close itself** (`window.close()` is refused). Exiting is done
  with the device's back button: back on home shows "לצאת מ־IzaZoo?", one more back
  leaves the app, "ביטול" cancels.
- **Chrome ignores history entries a page adds before the user taps anything.**
  So back before the first tap exits without the prompt. History entries are
  therefore only added on a tap (see `ensureExitGuard`), and never in response to
  a back press.

## Lessons learned

- **Screens that load data before drawing** (admin, feedback) must check after
  loading that the user is still on that screen (`currentScreen`) before drawing.
  Otherwise a back press during a slow load is undone by the late drawing.

- **After saving inside a details window, redraw the list behind it**
  (`refreshScreenBehindModal`), otherwise the list shows old data until the user
  leaves and returns.

## Done so far

- Removed hard-coded user list and passwords, the debug-log button, and the way to
  skip the forced password change with the back button.
- Fixed: update edits overwriting other updates, problems closing before
  confirmation, lost typing on resume, scroll-to-update in portrait, dates using
  UTC instead of Israel time, blank page / sign-out on network problems, silent
  load failures.
- Faster loading: parallel requests; closed problems / done tasks from the last
  6 months, updates from the last 30 days plus active pins, latest 300 activity
  rows (full history when a problem is opened).
- Rewrote back-button and exit handling (see above).
- Permissions review (Nov 2026): every table has row-level security; admin
  database functions check the caller. Fixed: logged-out access to server
  functions and a public staff list; managers able to read other businesses'
  updates via update links; anyone posting to all businesses; inactive users
  posting; limited admins able to reset passwords / create users in the
  edge function. Verified with role-simulated tests. Public sign-up is turned
  off in Supabase (users are created only from the admin screen).
  Optional, not done: Supabase's leaked-password protection.
- Removed 27 unused JavaScript functions (old login picker, old update/doc
  modals, debug log viewer, unused animations, etc.). The knowledge module's
  functions (`newKnowledge`, `openKnowledge`, `editKnowledge`, category
  functions…) were kept on purpose: the module is closed but planned.

## Next steps (in order)

1. **CSS cleanup and building each screen once.** Opus, in small steps with
   before/after screenshots. Done so far: (1) removed 292 CSS selectors that
   target class names the app never uses (about 21 KB); (2) removed 1,155 CSS
   settings always overridden by a later rule with the identical selector in the
   same context (about 38 KB); (3) merged the two style blocks into one. Next:
   rendering each screen once instead of twice (portrait + landscape). This is
   the riskiest step: plan it, do it one screen at a time, and have the owner
   check each screen on the phone. Each
   screen is currently rendered twice (portrait and landscape) and the CSS has many
   overriding rules; removing the wrong one can quietly break a screen.

## Testing

For CSS changes, take full-page screenshots of every screen and window in
portrait (390x844) and landscape (1280x800) before and after the change and
compare them pixel by pixel; the change is accepted only with zero differences
(or differences the owner asked for). Wait for focus/scroll animations to settle
before taking a screenshot, or the comparison will show false differences.
Class names built at runtime (`module-${active}`, `calendar-${x.type}`,
`nav-${id}`) don't appear literally in the code; account for them when deciding
whether a CSS rule is unused.


There is no automated test suite in the repository. Test changes in headless
Chromium (Playwright is pre-installed) by serving the folder locally and replacing
`vendor/supabase.js` with a small fake client, or by routing `*.supabase.co`
requests to fake responses while using the real library. Always finish by asking
the owner to check the change on their phone.
