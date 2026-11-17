---
name: health-check
description: Mini-review of the whole IzaZoo app, so problems are caught while small. Run only when the owner types /health-check or agrees to it. Never schedule it; suggest it to the owner after a batch of changes, about a month after the last one, or before a big new feature.
---

# Health check

Work in plain, non-technical language for the owner (see CLAUDE.md). This only
reports; fix things afterwards as normal changes (one pull request each, with
/qa). Setup once: `cd tests && npm install`.

1. **Tests:** `node --test tests/app.test.js` must pass, and the latest "Tests"
   run on `main` on GitHub must be green.
2. **Test coverage:** list the changes merged since the last health check
   (`git log` since the date recorded in CLAUDE.md). Each fix or new behaviour
   should have a test in `tests/app.test.js`; list any that don't.
3. **Leftovers:** `node tests/tools/unused-functions.js index.html`,
   `node tests/tools/deadcss.js index.html` and
   `node tests/tools/overridden.js index.html` should all report 0.
4. **Security:** run the security check (`.claude/skills/security-check/SKILL.md`),
   including the saved database check `tests/db/checks.sql` (must report ALL PASSED).
5. **Size and shape:** note the size of `index.html` (and of its style block)
   and compare with the last health check in CLAUDE.md. Big growth is a sign
   that code is being added without cleaning up.
6. **Out of step:** the deployed `admin-users` function and database changes
   match `supabase/`; `CLAUDE.md` describes the app as it is now.
7. **Report** to the owner in a short list: healthy / needs attention, with a
   proposed fix for each item, smallest first. Then record the date and the
   sizes under "Health checks" in CLAUDE.md.
