# IzaZoo tests

Everything runs in headless Chromium against a fake database
(`fake-supabase.js`), so the real Supabase project is never touched.
Playwright with Chromium must already be installed.

## Behaviour tests

```
node --test tests/app.test.js
```

Each test checks its own result (pass / fail). Run them after every change.

## Database access check (real database)

`tests/db/checks.sql` tests the access rules on the real Supabase database:
both permission layers for every action the app performs, nothing reachable
without logging in, and what the owner and a manager can and cannot do. It
runs inside one block that rolls everything back, so nothing is changed, and
reports `DB CHECKS: ALL n PASSED` or the list of failed checks. Run it through
the Supabase connector (execute_sql) or paste it into the SQL Editor. It is
not run on GitHub on purpose: that would need the live database's password
stored on GitHub.

## Screenshot comparison (for styling changes)

```
cd tests && npm install && cd ..
node tests/visual/screenshots.js tests/visual/out/before   # before the change
# ...make the change...
node tests/visual/screenshots.js tests/visual/out/after
node tests/visual/compare.js tests/visual/out/before tests/visual/out/after
```

A styling change is accepted only with zero differences (or differences the
owner asked for). Differing screenshots get a `diff-*.png` showing what changed.

## CSS clean-up tools

`tests/tools/deadcss.js` and `tests/tools/overridden.js` report (and with
`--write` remove) CSS that can never apply. Always follow with the screenshot
comparison.
