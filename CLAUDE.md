# IzaZoo – notes for Claude

## About the owner (how to work with them)

- The owner does not write code and relies on Claude for all technical work.
  Explain things in plain, non-technical language. Avoid jargon; when a technical
  term is unavoidable, say what it means.
- **Act, then inform.** Claude may push, open pull requests and merge them into
  `main` without asking first, then tell the owner what was done and how to test it
  on their phone. Still ask before anything that cannot be undone, such as deleting
  data or changing the database.
- **Model advice.** Before starting a task, tell the owner which model to use:
  - Fable for hard or risky work: security and database permissions, large
    restructures, the CSS cleanup, or a bug that has resisted earlier attempts.
  - Opus for everything else, and switch back to Opus once the hard part is done.
- **Say up front when something can't be done.** If a request runs into a browser
  or platform rule that code can't change, say so before writing code, and offer
  the best alternative. (Example below: a web app cannot close itself.)

## The app

- A single-page Hebrew (RTL) management app for the IzaZoo businesses: problems
  (תקלות), tasks (משימות), updates (עדכונים), knowledge (ידע ונהלים, still closed),
  an admin screen and user feedback.
- Everything is in `index.html` (CSS + JS, roughly 130 KB of CSS). `sw.js` is the
  service worker; `vendor/supabase.js` is a bundled copy of supabase-js v2.119.0.
  Bump the cache name in `sw.js` when you change files it caches.
- Backend: Supabase (auth with `<username>@izazoo.local`, tables, RPCs and an
  `admin-users` edge function). Only the publishable key is in the page.
- Published with GitHub Pages from `main`:
  https://fertmana-eng.github.io/IzaZoo-management/
  A merge goes live about 2 minutes later; the app must be fully closed and
  reopened on the phone to pick up a new version.
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

## Next steps (in order)

1. **Database permissions review (use Fable).** The app only hides buttons; the
   real protection must be in Supabase row-level security policies, the RPC
   functions (especially `admin_*`, `close_problem`, `complete_task`,
   `replace_*_targets`) and the `admin-users` edge function. Check that every
   table has RLS on, and that a logged-in non-admin cannot read or change other
   businesses' data or perform admin actions. Report findings in plain language
   and ask before changing anything in the database.
2. **CSS cleanup and building each screen once (use Fable for the cleanup).** Each
   screen is currently rendered twice (portrait and landscape) and the CSS has many
   overriding rules; removing the wrong one can quietly break a screen.
3. Remove unused JavaScript (about 27 unused functions).

## Testing

There is no automated test suite in the repository. Test changes in headless
Chromium (Playwright is pre-installed) by serving the folder locally and replacing
`vendor/supabase.js` with a small fake client, or by routing `*.supabase.co`
requests to fake responses while using the real library. Always finish by asking
the owner to check the change on their phone.
