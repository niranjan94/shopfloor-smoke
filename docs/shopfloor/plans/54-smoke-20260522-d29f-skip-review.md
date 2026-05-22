# Plan: 'Today' quick-filter button for tasks list

Implements issue [#54](https://github.com/niranjan94/shopfloor-smoke/issues/54).

Adds a single `Today` toggle button to the filters row in `app/page.tsx`. When active, the existing `filtered` chain drops any task whose `createdAt` is older than 24 hours (`Date.now() - 86_400_000`). State is purely client-side; no DB, schema, or type changes are needed because `Task.createdAt: string` already exists (see `app/types.ts:9`).

No design spec was authored for this issue (medium flow). Decisions are derived from the issue body and the triage comment on [#54](https://github.com/niranjan94/shopfloor-smoke/issues/54).

## Decisions

1. **State.** A single boolean React state `filterToday`, default `false`, declared next to the other `filter*` states in `Home()` in `app/page.tsx`.
2. **Filter logic.** Added as a new condition inside the existing `.filter((t) => { ... })` chain (after the `filterPriority` check, before the `searchQuery` check). The condition is: `if (filterToday && new Date(t.createdAt).getTime() < Date.now() - 86_400_000) return false;`. Using `new Date(t.createdAt).getTime()` matches the parsing used elsewhere in the file (e.g. line 150's `created` sort).
3. **Placement.** The toggle is rendered inside the existing `{/* Filters */}` `glass` panel, on a new flex row below the 4-column grid of selects (status / category / priority / sort). Placing it on a new row avoids disturbing the existing 4-column grid layout.
4. **Visual states.** Toggle uses the existing button classes:
   - Inactive: `btn btn-ghost btn-sm`
   - Active: `btn btn-primary btn-sm`
   The label is the literal string `Today` in both states. `aria-pressed={filterToday}` is set on the button.
5. **Behavior.** Clicking the button toggles `filterToday` with `setFilterToday((v) => !v)`. No other state is touched.
6. **No persistence.** `filterToday` is in-memory only; it resets on reload. The existing filters (`filterStatus`, `filterCategory`, `filterPriority`, `searchQuery`, `sortBy`) are also in-memory, so this matches the established pattern.
7. **Empty-state copy.** The existing "No tasks match your filters." copy at `app/page.tsx:285` is reused unchanged.

## Testing strategy

`CLAUDE.md` states: "**No tests**: this is a smoke test target, not a tested app. There is no test suite." There is no `test/`, `tests/`, `__tests__/`, `spec/`, or `e2e/` directory, and `package.json` defines no `test` script. Per the plan-agent methodology, this plan marks unit, integration, and e2e layers as **skipped — repository has no test suite per `CLAUDE.md`**.

The plan instead requires the following static and build-level verifications at every feature task. The implementation agent MUST run each command and confirm the stated expected output before committing.

| Layer | Command | Expected outcome | Status |
| --- | --- | --- | --- |
| Type check | `pnpm exec tsc --noEmit` | Exits 0 with no diagnostics. | Required |
| Lint | `pnpm lint` | Exits 0 with no errors (warnings acceptable only if pre-existing on `main`). | Required |
| Build | `pnpm build` | `next build` completes successfully (exit 0). | Required |
| Unit tests | n/a | Skipped — repository has no test suite per `CLAUDE.md`. | Skipped |
| Integration tests | n/a | Skipped — repository has no test suite per `CLAUDE.md`. | Skipped |
| e2e tests | n/a | Skipped — repository has no test suite per `CLAUDE.md`. | Skipped |
| Manual smoke | `pnpm dev`, open `http://localhost:3000`, perform the scenarios listed under Task 1 step 5. | All scenarios behave as described. | Required |

## Tasks

### Task 1 — Add `filterToday` state, filter condition, and toggle button in `app/page.tsx`

Atomic task. One file changed. Adds the feature end-to-end (state + filter condition + UI control) because the three pieces are interlocked and a partial commit would leave a broken UI (button without state, or state without UI). No new files. No tests are written because the repository has no test suite (see Testing strategy, layers marked Skipped).

**Affected files**

- Create: _(none)_
- Modify: `app/page.tsx`
- Test: _(none — unit/integration/e2e layers skipped per testing strategy; verification is via type check + lint + build + manual smoke)_

**Step 1 — Add state declaration.**

In `app/page.tsx`, immediately after the existing line

```tsx
const [searchQuery, setSearchQuery] = useState("");
```

(currently `app/page.tsx:45`), insert a new line:

```tsx
const [filterToday, setFilterToday] = useState(false);
```

**Step 2 — Add filter condition.**

In `app/page.tsx`, inside the existing `.filter((t) => { ... })` chain that starts at `app/page.tsx:131`, insert a new condition immediately after the `filterPriority` line and before the `searchQuery` line. The resulting block must read exactly:

```tsx
.filter((t) => {
  if (filterStatus !== "all" && t.status !== filterStatus) return false;
  if (filterCategory !== "all" && t.category !== filterCategory) return false;
  if (filterPriority !== "all" && t.priority !== filterPriority) return false;
  if (filterToday && new Date(t.createdAt).getTime() < Date.now() - 86_400_000) return false;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    if (!t.title.toLowerCase().includes(q) && !t.description?.toLowerCase().includes(q)) return false;
  }
  return true;
})
```

Use the literal numeric separator `86_400_000` (24 × 60 × 60 × 1000 ms). Do not extract a named constant — there is no reuse, and the surrounding file uses inline literals (e.g. priority map at line 148).

**Step 3 — Add the toggle button to the Filters panel.**

In `app/page.tsx`, inside the existing `{/* Filters */}` `glass` div (currently `app/page.tsx:242`–`275`), the inner `<div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>` already contains the search input and the 4-column grid of selects. Append a new sibling row inside that same flex column, immediately after the closing `</div>` of the 4-column grid (currently line 273) and before the outer `</div>` (currently line 274). The new row is exactly:

```tsx
<div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
  <button
    type="button"
    className={filterToday ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
    aria-pressed={filterToday}
    onClick={() => setFilterToday((v) => !v)}
  >
    Today
  </button>
</div>
```

Do not change the existing search input, the 4-column grid, or any styles around it.

**Step 4 — Verify static checks.**

Run, in order, and confirm each exits 0:

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm build
```

If `tsc` reports an error, the most likely cause is a typo in the state hook or filter condition — fix and re-run. If `pnpm lint` reports a new error (one not already present on `main`), fix the lint error before continuing; do not disable the rule.

**Step 5 — Manual smoke verification.**

Start the dev server with `pnpm dev` and open `http://localhost:3000`. Perform every scenario below. Each must behave as described before committing.

1. **Default off.** On first load, the `Today` button renders below the four filter selects with the `btn btn-ghost btn-sm` classes and `aria-pressed="false"`. The task list contents are unchanged from before this task.
2. **Toggle on, recent task visible.** Create a new task via the form (title `Smoke today`). Click the `Today` button. The button switches to the `btn btn-primary btn-sm` classes and `aria-pressed="true"`. The newly created task remains in the list.
3. **Toggle on, old task hidden.** With `Today` still active, manually insert an "old" task by opening DevTools → Application → IndexedDB → `TodoApp` → `tasks`, and edit the `createdAt` of any one task to an ISO timestamp more than 24 hours in the past (e.g. `2026-05-20T00:00:00.000Z` given today is `2026-05-22`). Reload the page, click `Today` again to re-activate. The edited task must not appear; tasks created in the last 24 hours must appear.
4. **Toggle off restores list.** Click `Today` a second time. Button returns to ghost styling and `aria-pressed="false"`. The previously hidden old task reappears.
5. **Combines with other filters.** With `Today` active, change the status select to `Done`. The list shows only tasks that are both done **and** created in the last 24 hours. Changing the category and priority selects narrows further. Typing into the search box also narrows further. The combined behavior must intersect (logical AND), matching the existing pattern.
6. **Empty-state copy.** With `Today` active and no tasks created in the last 24 hours (delete any recent ones if needed), the list area shows the existing copy `No tasks match your filters.`

If any scenario fails, fix and re-run static checks before committing.

**Step 6 — Commit.**

Stage only `app/page.tsx`. Commit message (verbatim, single line, Conventional Commits):

```
feat(tasks): add Today quick-filter button to filter tasks created in the last 24 hours
```

### Task 2 — (none)

This plan intentionally ships as a single task. The change is one file, one boolean, one condition, one button, and the three pieces are not independently shippable.

## Out of scope

- Persisting `filterToday` across reloads.
- A 'This week' or other time-window filter button.
- Refactoring the existing filter logic into a reducer or `useMemo`. (`filtered` is computed inline today and the new condition does not change that cost meaningfully.)
- Tests. The repository has no test suite (`CLAUDE.md`); adding one is out of scope for a smoke-target feature.

## Risks & rollback

- **Risk.** The 24-hour window is computed at render time from `Date.now()`. A task created exactly 24 hours ago will flicker in/out as the clock advances; this is acceptable for a UI filter and matches the spirit of the issue ("last 24 hours").
- **Risk.** If `task.createdAt` is malformed, `new Date(...).getTime()` returns `NaN`; the comparison `NaN < anything` is `false`, so a malformed task is **kept** when `filterToday` is on. This is the safe direction (we never hide a task because of bad data) and matches the existing sort logic at line 150, which also tolerates bad input by treating it as `NaN`.
- **Rollback.** Revert the single commit produced by Task 1. There is no migration, no persisted state, and no other file changes, so revert is total.
