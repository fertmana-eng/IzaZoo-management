---
name: design-check
description: Visual check for a change that could affect how the IzaZoo app looks (CSS, HTML templates, layout code). Use before merging such a change, or when the owner types /design-check.
---

# Design check

Work in plain, non-technical language for the owner (see CLAUDE.md).

1. **Screenshots before and after.** One-time setup: `cd tests && npm install`.
   - Take "before" screenshots on the code without the change (for example
     `git stash`, run, `git stash pop`):
     `node tests/visual/screenshots.js tests/visual/out/before`
   - Take "after" screenshots with the change:
     `node tests/visual/screenshots.js tests/visual/out/after`
   - Compare: `node tests/visual/compare.js tests/visual/out/before tests/visual/out/after`
   The screenshots cover 27 screens and windows, portrait (390x844) and
   landscape (1280x800). If the change shows something new, add that state to
   `STATES` in `tests/visual/screenshots.js`.
2. **Judge the differences.**
   - Not intended → it's a bug; fix it and compare again.
   - Intended → look at the after screenshot yourself (open the PNG) and check:
     Hebrew text right-aligned and not clipped, spacing and sizes consistent
     with the rest of the app, colours from the existing palette (CSS
     variables), nothing overlapping, buttons large enough to tap.
   - A single-pixel difference that disappears on a re-run is rendering
     flicker, not a change.
3. **Show the owner** the before/after of any intended visual change (send the
   images) and get their OK before merging.
4. **Keep the CSS tidy:** `node tests/tools/deadcss.js index.html` and
   `node tests/tools/overridden.js index.html` should report 0. If not, run
   them with `--write` and compare screenshots again.
5. Report in a few lines: screenshots compared, differences found, owner's OK.
