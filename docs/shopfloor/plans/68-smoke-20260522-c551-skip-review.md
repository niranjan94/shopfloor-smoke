# Plan: Add a "Today" quick-filter button to the tasks list

Origin issue: #68 — adds a `Today` quick-filter button to the tasks list that filters
to tasks created in the last 24 hours. Triaged as **medium** — no design spec exists,
so this plan derives the design directly from the issue body and triage comment.

## Testing strategy

This project has **no automated test suite**. `CLAUDE.md` states explicitly:
"No tests: this is a smoke test target, not a tested app. There is no test suite."
`package.json` defines only `dev`, `build`, `start`, and `lint` scripts; there is no
`test/`, `tests/`, `spec/`, `__tests__/`, or `e2e/` directory.

The implementer therefore cannot write a failing automated test for a new feature.
Instead, every feature task in this plan uses the following verification layers,
which are the only ones the project's existing surface supports:

| Layer | Command | What it catches |
| ----- | ------- | --------------- |
| **Type check** | `pnpm exec tsc --noEmit` | TypeScript errors in the changed file and any consumers |
| **Lint** | `pnpm lint` | ESLint violations (the `eslint-config-next` ruleset) |
| **Build** | `pnpm build` | Next.js production build errors (catches issues `tsc` misses, e.g. RSC boundary mistakes) |
| **Manual smoke** | `pnpm dev`, then exercise the feature in a browser at http://localhost:3000 | Functional and visual correctness of the UI change |

The five-step TDD shape is therefore adapted as follows for feature tasks in this
plan: (1) skipped — no test framework, (2) skipped, (3) make the production change,
(4) run type-check, lint, build, and the manual smoke checklist for that task,
(5) commit using the Conventional Commits message printed in the task header.
Each task lists its full manual smoke checklist so the implementer does not need
to invent one.

## Design summary (derived from issue + triage)

The triage comment in #68 already pins the shape of the change:

- **State:** one new boolean React state `filterToday` in `app/page.tsx`, initialised
  to `false`.
- **Predicate:** one additional check in the existing `tasks.filter(...)` chain
  comparing `t.createdAt` (already an ISO-8601 string on every task — see
  `app/types.ts:9`) against a 24-hour window: `Date.now() - new Date(t.createdAt).getTime() <= 86_400_000`.
- **UI:** one toggle button in the existing filters panel (the `glass` block at
  `app/page.tsx:242`).
- **Schema:** none. `Task.createdAt` is already present and populated on every save
  (`app/page.tsx:79`).
- **Files touched:** exactly one — `app/page.tsx`. No new files, no changes to
  `types.ts`, `db.ts`, components, or styling.

### Decisions this plan locks in (no spec to defer to)

The triage comment flagged three details to pin down. This plan resolves them:

1. **Button placement.** The filters panel at `app/page.tsx:242` currently contains
   a search `<input>` followed by a 4-column grid of `<select>` controls
   (status, category, priority, sort). Inserting the toggle into that grid would
   force it to 5 columns and squeeze every control. Instead, insert a **new row
   between the search input and the 4-column grid**, rendered as a left-aligned
   flex row containing the single toggle button. This preserves the existing
   grid untouched and leaves room to add further quick-filters later without
   re-laying-out the panel.
2. **Active/inactive styling.** Use the existing button classes (defined in
   `app/globals.css`, confirmed at lines 181, 197, 218):
   - **Inactive:** `className="btn btn-ghost btn-sm"`.
   - **Active:**   `className="btn btn-primary btn-sm"`.
   These are the same primary/ghost pair already used by the Add/Edit/Delete
   buttons in the form and task rows, so the toggle is visually consistent with
   the rest of the page without inventing new CSS.
3. **Interaction with the other filters.** The new predicate is added as an
   additional `if (...)` line **inside the existing `.filter()` callback at
   `app/page.tsx:131-140`**, alongside the status/category/priority/search
   checks. This means all four filters AND-combine, matching the existing
   semantics. The empty-state message at `app/page.tsx:285`
   (`"No tasks match your filters."`) already covers the "Today + other filter
   yields zero results" case with no change required.

### Behaviour spec (the contract Task 1 must satisfy)

- Clicking the button when `filterToday === false` sets it to `true`, immediately
  hides every task whose `createdAt` is older than 24 hours from `Date.now()`,
  and changes the button's class from `btn btn-ghost btn-sm` to
  `btn btn-primary btn-sm`.
- Clicking the button when `filterToday === true` sets it to `false`, restores
  every task that the Today predicate had been hiding, and reverts the button
  class to `btn btn-ghost btn-sm`.
- The Today filter combines with `filterStatus`, `filterCategory`,
  `filterPriority`, and `searchQuery` using AND. Example: with `filterStatus = "done"`
  and `filterToday = true`, only tasks that are both done AND created in the last
  24 hours appear.
- The button label is `"Today"` in both states. (No icon, no count badge.)
- The 24-hour window is computed at every render against `Date.now()`. The plan
  does not pin a memoised "now"; for a smoke target this is acceptable and
  matches the existing pattern of recomputing `filtered` every render.

## Tasks

There is exactly one task. The change is small enough (one file, one state, one
predicate, one button) that splitting it would create artificial coupling between
sub-tasks that cannot be reviewed independently — the state without the button is
unreachable, and the button without the state is dead. The triage comment
explicitly characterised this as "one new boolean state, one additional predicate,
one toggle button", so the atomic unit is the whole feature.

---

### Task 1 — Add the `Today` quick-filter to the tasks list

**Commit message (Conventional Commits, copy verbatim):**

```
feat(tasks): add Today quick-filter for tasks created in last 24h
```

**Affected files:**

- Modify: `app/page.tsx`
- Create: (none)
- Test: (none — see Testing strategy; no test framework exists in this project)

**Production change — apply all three edits to `app/page.tsx`:**

1. **Add the state.** Immediately after the existing line
   `const [filterPriority, setFilterPriority] = useState("all");`
   (currently `app/page.tsx:44`), insert:

   ```tsx
   const [filterToday, setFilterToday] = useState(false);
   ```

   Do not change the `useState` import (it is already imported on line 3).

2. **Add the predicate.** Inside the `.filter()` callback that currently spans
   `app/page.tsx:131-140`, immediately after the `filterPriority` check
   (`if (filterPriority !== "all" && t.priority !== filterPriority) return false;`),
   insert:

   ```tsx
   if (filterToday && Date.now() - new Date(t.createdAt).getTime() > 86_400_000) return false;
   ```

   Use the underscore numeric separator `86_400_000` (24 * 60 * 60 * 1000); it is
   supported by the TypeScript target this project uses and improves readability.
   Do not extract a helper function — the one-liner stays alongside the other
   filter predicates.

3. **Add the toggle button.** Inside the filters `glass` panel that starts at
   `app/page.tsx:242`, between the existing search `<input>` (closing `/>` on
   `app/page.tsx:250`) and the 4-column grid `<div>` (opening on
   `app/page.tsx:251`), insert this new row:

   ```tsx
   <div style={{ display: "flex", gap: "0.5rem" }}>
     <button
       type="button"
       className={filterToday ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
       onClick={() => setFilterToday((v) => !v)}
       aria-pressed={filterToday}
     >
       Today
     </button>
   </div>
   ```

   Notes the implementer must follow exactly:
   - `type="button"` is required to prevent any future enclosing `<form>` from
     submitting (defensive; there is no form today).
   - `aria-pressed={filterToday}` is required so the toggle state is exposed to
     assistive technology; this is the React idiom for a toggle button.
   - Do **not** reorder, rename, or restyle any of the existing four `<select>`
     controls. The new row is additive only.

**Do not change anything else.** In particular:

- Do not modify `app/types.ts` — `Task.createdAt` is already typed as `string`.
- Do not modify `app/db.ts` — no persisted state changes.
- Do not modify `app/globals.css` — the `btn`, `btn-primary`, `btn-ghost`, and
  `btn-sm` classes already exist (verified at `app/globals.css:181`, `:197`,
  `:218`).
- Do not add a "Clear filters" button, a count badge, a tooltip, or any other
  scope creep beyond what is listed above.

**Verification (run in order, all must pass before committing):**

1. `pnpm install` — only if `node_modules/` is absent; skip otherwise.
2. `pnpm exec tsc --noEmit` — must exit 0 with no errors. Expected output ends
   with no diagnostics (silent success).
3. `pnpm lint` — must exit 0. Expected output: `✔ No ESLint warnings or errors`
   or an empty output indicating success for the Next.js ESLint config.
4. `pnpm build` — must complete with `✓ Compiled successfully` and produce a
   `.next/` directory. This catches Next.js / React Server Component boundary
   errors that `tsc` alone misses.
5. `pnpm dev` (run in background; open http://localhost:3000). Execute the
   **manual smoke checklist** below in full. Every item must pass. If any item
   fails, fix the code and re-run from step 2.

**Manual smoke checklist (every item must pass):**

- [ ] The tasks page loads without a console error in the browser DevTools console.
- [ ] The filters panel shows the new `Today` button on its own row, above the
      row of four `<select>` controls, left-aligned.
- [ ] On first load (before clicking), the `Today` button is rendered with the
      ghost style (same look as the `Edit` button on a task row).
- [ ] Create a new task with title `"smoke-today-A"`; it appears in the list.
- [ ] Click `Today`. The button switches to the primary (filled / gold) style.
      The newly-created `smoke-today-A` task remains visible.
- [ ] Open the browser DevTools → Application → IndexedDB → `TodoApp` → `tasks`
      object store. Pick any task, edit its record so `createdAt` is set to an
      ISO timestamp older than 24 hours ago (e.g. set the year to last year).
      Reload the page. With `Today` still pressed, that task does **not** appear;
      with `Today` un-pressed, it does appear.
- [ ] With `Today` active, change the **Status** `<select>` to `Done`. The list
      now shows only tasks that are both done **and** created in the last 24
      hours (AND-combination). Switch the status back to `All Status` to confirm
      the Today filter is still active and the list expands accordingly.
- [ ] With `Today` active, type a string in the search box that matches no task.
      The empty-state card reads `"No tasks match your filters."` (existing
      copy at `app/page.tsx:285`).
- [ ] Click `Today` again. The button reverts to the ghost style and all tasks
      that the predicate had hidden re-appear immediately.
- [ ] In DevTools → Accessibility, focus the `Today` button and confirm
      `aria-pressed` toggles between `"false"` and `"true"` on each click.

**Commit step:**

After every verification step passes, stage `app/page.tsx` and commit using
exactly the message printed at the top of this task. Do not amend an earlier
commit; create a new one.

---

## Out of scope (do NOT add in this plan)

The following are deliberately excluded. If a reviewer requests any of them,
file a follow-up issue rather than expanding this PR:

- Persisting `filterToday` across reloads (e.g. in `localStorage` or IndexedDB).
- A "last 7 days" or "this week" companion filter.
- Replacing the existing inline `style={...}` objects with Tailwind utility
  classes or CSS modules.
- Adding a test framework. The project explicitly opts out of tests per
  `CLAUDE.md`; introducing one is a separate decision, not a side effect of
  this feature.
- Memoising the `filtered` computation or `Date.now()` evaluation.

## Self-review against the rubric

- **Completeness:** Testing strategy is present (derived from the project's actual
  surface — no test framework, so type-check/lint/build/manual-smoke are the
  layers). The single task lists files, exact code, commands, expected outputs,
  and a CC commit message. No `TBD` or placeholders.
- **Spec alignment:** No spec exists. Every requirement from the issue body
  (Today button, 24-hour window, UI + client filter state, two-or-three files)
  is covered. The triage comment's three pinned details (state, predicate,
  button) all have explicit code in Task 1. The plan deliberately uses one file
  (within the "two or three" range the issue allows) because no other file
  needs touching.
- **Task decomposition:** One atomic task; splitting would create dependent
  sub-tasks that cannot be reviewed in isolation (state without button is
  unreachable; button without state is dead). The task declares the file
  (`app/page.tsx`) and the verification steps map to the test layers named in
  the Testing strategy section.
- **Buildability:** A senior engineer can execute Task 1 without re-reading the
  issue: every insertion point is anchored to a line in the current
  `app/page.tsx`, every class name is verified against `app/globals.css`, and
  the smoke checklist names exact button labels and selector values.
