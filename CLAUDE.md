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
  (תקלות), tasks (משימות), updates (עדכונים), knowledge (ידע ונהלים, a document library),
  an admin screen and user feedback.
- Knowledge = a document library (Nov 2026; owner's decisions): PDF files
  (other types possibly later), up to 20 MB each, in the private Supabase
  storage bucket `knowledge`. Filtered by business (chips; the app's active
  business) and by category within the business (only categories that have
  documents there; the 7 categories are fixed, no category admin). PDFs open
  inside the app with PDF.js (`vendor/pdfjs`, legacy build, loaded only when a
  document is opened), because Android Chrome can't show PDFs inside a page.
  Only the owner and full admins upload, edit details, replace files (old file
  deleted) and archive (asks first; archive visible to admins only). Everyone
  else views and downloads the documents for their business. Previous versions
  are recorded in `knowledge_versions` but not shown. The database enforces
  this (`supabase/migrations/20261117_knowledge_*.sql`; administrators see
  every item). "הסרה" asks: archive (restorable) or delete for good (document
  and file; also available on archived documents).
  Supabase free plan: 1 GB storage in total.
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
  deploys work through the connector, and so do changes that only add something
  (e.g. `create policy`, `add column`): apply those directly with
  apply_migration. Only changes that drop or replace something trigger the
  prompt; for those, put the SQL alone at the top of a short message for the
  owner. Never work around the prompt by rewriting a removal as an addition
  (extra rules that override or neutralise old ones): that leaves dead or
  conflicting rules behind, and since access rules add up (OR), an added rule
  can never take away access an old rule grants. Role-simulated tests in a DO block that
  ends with `raise exception` (so everything is rolled back) work too, as long as
  they contain no UPDATE/DELETE (those trigger the prompt). Dry-run a migration
  the same way (EXECUTE each statement, then raise) before giving it to the owner.
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

- **The test suite's fake database has no access rules.** A database rule
  that refuses the app's own writes (e.g. reading back a new row before it is
  linked to a business) passes every test. Before merging anything that writes
  to the database, test the write as the real user in the real database
  (security-check step 4). This is how the first document upload failed.

- **Database access has two layers:** the table permission (GRANT) and the row
  rules (policies). Adding a delete policy did nothing because the table had no
  DELETE permission, so the first permanent delete was refused. Check both
  (security-check step 4).

- **Anything drawn on a canvas must be left-to-right.** The app is RTL and a
  canvas inherits the direction, which shifts every letter PDF.js draws (the
  document viewer showed scrambled text). The viewer sets `dir="ltr"`.

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
  Leaked-password protection is not available on the free Supabase plan.
- Styling cleanup (Nov 2026), all verified with zero-difference before/after
  screenshots: removed 292 CSS selectors for class names the app never uses and
  1,155 settings always overridden by a later identical rule; merged the two
  style blocks (CSS went from about 130 KB to about 71 KB). Every screen,
  including home, now builds only the layout for the current orientation
  (`viewportMode()`) and is redrawn when the orientation changes
  (`onViewportChange`); before, each screen was built twice and one copy hidden.
- Removed 27 unused JavaScript functions (old login picker, old update/doc
  modals, debug log viewer, unused animations, etc.).
- Opened the knowledge module as a document library (see "The app" above).

## Next steps (in order)

Nothing pending. (Supabase's leaked-password protection needs a paid Supabase
plan; the project is on the free plan, so don't suggest it unless that changes.)

## How we make changes (always)

The app was first built in Claude chat, without history, tests or checks, and
needed a long review to fix. These rules keep that from happening again:

- **All changes go through Claude Code on this repository**, never by pasting a
  whole new `index.html` from a chat. Ideas from a chat are fine; bring the idea,
  not the file.
- **Small changes, one at a time:** one pull request per fix or feature, so a
  problem is easy to find and undo.
- **Every change gets /qa** (and /design-check or /security-check when they
  apply). Every bug fixed gets a test that would have caught it.
- **Merge only when the GitHub "Tests" check is green**, then ask the owner to
  check on the phone.
- **Clean up as you go:** when replacing something, remove the old code/CSS in
  the same change instead of adding overrides on top.
- **Keep this file current.** Never schedule /health-check (owner's decision).
  Instead, *suggest* it to the owner when it's appropriate (after a batch of
  several changes, about a month since the last one, or before a big new
  feature), and run it only if the owner agrees.

## Checks ("departments")

Three project skills hold the checklists; use them as described:
- `/qa` (`.claude/skills/qa/SKILL.md`): after every change, before merging.
- `/design-check`: when anything visual could change.
- `/security-check`: when data, logins, permissions or Supabase code change.
- `/health-check`: suggest it (don't run or schedule it on your own) after a
  batch of changes, about a month after the last one, or before a big feature.

The "Tests" GitHub workflow (`.github/workflows/tests.yml`) runs the behaviour
tests on every pull request and on `main`. Merge only when it is green.
A GitHub ruleset on `main` (set up by the owner, Nov 2026) enforces this: the
`behaviour-tests` check must pass before anything is merged, `main` can't be
deleted or force-pushed, and nobody is on the bypass list. If the workflow's
job is ever renamed, the ruleset's required check must be renamed to match
(Settings → Rules), or nothing can be merged.

## Testing

Tests live in `tests/` (see `tests/README.md`). They run in headless Chromium
against a fake database (`tests/fake-supabase.js`), never the real project.

- **Behaviour tests:** `node --test tests/app.test.js` (35 tests, each checks its
  own result). Run them after every change, and add a test for every bug fixed.
- **Styling changes:** take screenshots before and after with
  `tests/visual/screenshots.js` and compare with `tests/visual/compare.js`
  (`cd tests && npm install` first). Accept only zero differences, or
  differences the owner asked for.
- **Real-database check:** `tests/db/checks.sql` (40 checks, rolled back),
  run by the security check. Not run on GitHub on purpose (it would need the
  live database password there).
- **Clean-up tools:** `tests/tools/deadcss.js`, `tests/tools/overridden.js`,
  `tests/tools/unused-functions.js` (report only unless `--write`).
- Class names built at runtime (`module-${active}`, `calendar-${x.type}`,
  `nav-${id}`) don't appear literally in the code; the CSS tools account for them.
- Always finish by asking the owner to check the change on their phone.

## Health checks

- 2026-11-17 (end of the full review): all 26 tests pass; no unused functions
  or CSS; security review done. `index.html` about 187 KB, style block about
  71 KB.
- 2026-11-17 (after the document library batch): 35 tests pass, GitHub green;
  no unused functions or CSS; security check clean (advisor shows only the two
  known warnings; every app write has both permission layers; owner/manager
  write tests pass; no orphan files). `index.html` about 198 KB (+11 KB for
  the whole document library), style block about 73 KB; PDF viewer 1.9 MB in
  `vendor/pdfjs`, loaded only when a document is opened. Follow-ups: test added
  for the file-size display; the two unused category functions removed
  (`supabase/migrations/20261117_remove_category_functions.sql`); saved
  real-database check added (`tests/db/checks.sql`, all 40 pass). Nothing open.

