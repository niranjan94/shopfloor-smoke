# Plan: "Today" quick-filter button on tasks list

Issue: #14 — `smoke-20260521-b11b/skip-review-and-revise: revise plan target`

## Goal

Add a "Today" quick-filter toggle to the tasks-list filter bar in `app/page.tsx`. When enabled, the visible task list is restricted to tasks whose `createdAt` timestamp falls within the last 24 hours (rolling window, `now - 24h <= createdAt <= now`). The filter is additive (AND) with all existing filters (status, category, priority, search). The toggle is a single button that flips between an "off" and "on" visual state.

## Decisions (derived from issue + triage)

- **Filter semantics**: "last 24 hours" means a rolling 24-hour window measured from `Date.now()` at the moment `filtered` is computed (not "calendar today"). The triage comment specifies "created in the last 24 hours", so this is a strict rolling window using `Task.createdAt`.
- **Predicate location**: a new predicate inside the existing `tasks.filter(...)` chain at `app/page.tsx:131-139`, alongside the existing predicates. AND-combined with the others.
- **State shape**: a single `useState<boolean>` named `filterToday`, defaulting to `false` (filter off). No persistence — matches the existing pattern where all filter state is in-memory only.
- **UI placement**: a `<button>` element rendered as the first child of the existing four-column filter grid at `app/page.tsx:251`, before the status `<select>`. The grid is changed from `repeat(4, 1fr)` to `repeat(5, 1fr)` to accommodate the new control, keeping all controls on one row at typical widths. The button label is the text `Today`.
- **Visual states**: when `filterToday` is `false`, the button uses the existing `btn btn-muted` classes (the same muted style used elsewhere). When `true`, it uses `btn btn-primary` to indicate the filter is active. No new CSS is added; both classes already exist in the project stylesheet (confirmed by other call sites in `page.tsx`, e.g. line 229 and line 234).
- **Interaction with the empty-state message**: no change. The existing message at `app/page.tsx:285` ("No tasks match your filters.") already covers the case where the Today filter excludes everything.
- **No changes to `Task`, `Category`, or `db.ts`**: the filter is purely client-side and reads `createdAt`, which is already an ISO string on every task.

## Files touched

- `app/page.tsx` — add `filterToday` state, add the button, extend the `filtered` chain with the date predicate, change the filter grid column count.

That is the only file required. The triage comment said "two or three files"; investigation shows that the new filter dimension is entirely contained in `app/page.tsx` because filter state, filter UI, and the predicate all live there. No other file change is justified; introducing a second file would be a premature abstraction.

## Testing strategy

This project has no automated test suite (per `CLAUDE.md`: "No tests: this is a smoke test target, not a tested app."). The available verification layers, taken from `package.json` `scripts` and `CLAUDE.md`, are:

- **Lint** — `pnpm lint`. Runs ESLint over the project. Must pass with zero errors and zero warnings on touched files.
- **Type check** — `pnpm exec tsc --noEmit`. Runs the TypeScript compiler in no-emit mode. Must pass with zero errors.
- **Production build** — `pnpm build`. Runs `next build`. Must succeed.
- **Manual browser smoke** — `pnpm dev`, open `http://localhost:3000`, and exercise the feature in a real browser. This is the only layer that verifies behavior; unit/integration tests are explicitly out of scope for this repo.

Every feature task below runs all four layers as its verification step. The TDD shape's "write a failing test" steps are skipped because no test layer exists in which to write one; this exception is recorded on each task line per the methodology rules.

## Tasks

### Task 1 — Add `filterToday` boolean state to `Home`

**Exception**: this task is part of a larger atomic change to `app/page.tsx`. Steps 1, 2, 4 of the TDD shape are skipped (no automated test layer in this project; manual browser verification runs at the end of Task 4).

**Affected files**

- Modify: `app/page.tsx`

**Change**

Insert a new `useState` declaration immediately after the existing `searchQuery` state at `app/page.tsx:45`:

```tsx
const [filterToday, setFilterToday] = useState(false);
```

The exact placement: directly below

```tsx
const [searchQuery, setSearchQuery] = useState("");
```

and directly above

```tsx
const [sortBy, setSortBy] = useState<"created" | "dueDate" | "priority">("created");
```

No other changes in this task. Do not commit yet — Tasks 1–3 are bundled into a single commit in Task 4 because they form one logical change and any subset leaves the file in an inconsistent state (state without UI, or UI without predicate).

**Verification**

- Run `pnpm exec tsc --noEmit`; expect zero errors.

### Task 2 — Add the "Today" predicate to the `filtered` chain

**Exception**: same as Task 1 — no automated test layer; manual verification at end of Task 4.

**Affected files**

- Modify: `app/page.tsx`

**Change**

Inside the existing `.filter((t) => { ... })` block at `app/page.tsx:131-139`, insert a new predicate immediately after the `filterPriority` check (currently line 134) and before the `searchQuery` check (currently line 135). The new lines:

```tsx
if (filterToday) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  if (new Date(t.createdAt).getTime() < cutoff) return false;
}
```

The full predicate body after this edit reads:

```tsx
.filter((t) => {
  if (filterStatus !== "all" && t.status !== filterStatus) return false;
  if (filterCategory !== "all" && t.category !== filterCategory) return false;
  if (filterPriority !== "all" && t.priority !== filterPriority) return false;
  if (filterToday) {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    if (new Date(t.createdAt).getTime() < cutoff) return false;
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    if (!t.title.toLowerCase().includes(q) && !t.description?.toLowerCase().includes(q)) return false;
  }
  return true;
})
```

Note: `Date.now()` is evaluated once per render (inside the predicate it is captured before the per-item comparison). Because `filtered` is recomputed every render and the predicate runs over the in-memory `tasks` array, this is acceptable; recomputing the cutoff per-item is unnecessary but harmless. The above places `cutoff` inside the predicate intentionally so that the `if (filterToday)` short-circuit avoids the `Date.now()` call when the filter is off.

**Verification**

- Run `pnpm exec tsc --noEmit`; expect zero errors.

### Task 3 — Add the "Today" toggle button and widen the filter grid

**Exception**: same as Task 1 — no automated test layer; manual verification at end of Task 4.

**Affected files**

- Modify: `app/page.tsx`

**Change 3a — widen the filter grid**

At `app/page.tsx:251`, change

```tsx
<div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem" }}>
```

to

```tsx
<div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0.75rem" }}>
```

**Change 3b — insert the button as the first grid child**

Inside that grid `<div>`, immediately before the existing `<select className="input" value={filterStatus} ...>` element (currently `app/page.tsx:252`), insert:

```tsx
<button
  type="button"
  className={filterToday ? "btn btn-primary" : "btn btn-muted"}
  onClick={() => setFilterToday((v) => !v)}
  aria-pressed={filterToday}
  title="Show only tasks created in the last 24 hours"
>
  Today
</button>
```

Rationale for each attribute:

- `type="button"` — the button is inside a region that contains no `<form>`, but the attribute is included defensively to make the intent explicit.
- `className` toggles between `btn btn-muted` (off) and `btn btn-primary` (on); both classes are already used elsewhere in this file (`app/page.tsx:229`, `app/page.tsx:234`).
- `onClick` uses the functional updater form to avoid a stale-closure read.
- `aria-pressed` exposes the toggle state to assistive tech.
- `title` provides a hover tooltip explaining the rolling-24-hour semantics, matching the tooltip pattern already in use at `app/page.tsx:299`.

No other UI changes. Do not touch the search input, the other selects, the sort select, or the surrounding glass card.

**Verification**

- Run `pnpm exec tsc --noEmit`; expect zero errors.
- Run `pnpm lint`; expect zero errors and zero warnings on `app/page.tsx`.

### Task 4 — Verify end-to-end and commit

**Exception**: this is the verification + commit task for the bundled change from Tasks 1–3. Steps 1, 2 of the TDD shape are skipped (no automated test layer); steps 3, 4, 5 apply (the production change is the work from Tasks 1–3, the "test" is the manual + tooling verification below, and the commit is the final step).

**Affected files**

- No new edits in this task. This task verifies the cumulative changes from Tasks 1–3.

**Verification**

Run all of the following from the repository root, in order. Each must succeed before the next runs.

1. `pnpm exec tsc --noEmit` — expect exit code 0 and no output.
2. `pnpm lint` — expect exit code 0 and no errors or warnings.
3. `pnpm build` — expect exit code 0 and a successful Next.js production build. The build output must include the `/` route.
4. `pnpm dev`, then in a browser at `http://localhost:3000`:
   - The Filters card shows five controls on one row: a `Today` button, the status select, the category select, the priority select, the sort select.
   - The `Today` button starts in the muted style.
   - Create a new task with title `today-test`. It appears in the list. Click `Today`; the button switches to the primary style and the list still contains `today-test`.
   - Open browser devtools, in the Application tab, edit the `TodoApp` IndexedDB store to set the `createdAt` of `today-test` to a date 48 hours in the past (any ISO string older than `now - 24h`). Reload the page. With the `Today` filter still on, `today-test` is gone from the list. Click `Today` again; the button returns to the muted style and `today-test` reappears.
   - With the `Today` filter on, set the status filter to `Done`. The list shows tasks that are both created in the last 24 hours AND done (AND semantics, confirmed empty if no such task exists). The empty-state message reads `No tasks match your filters.`
   - Stop the dev server.

If any of steps 1–4 fail, fix the underlying issue in `app/page.tsx` and re-run from step 1. Do not commit until all four succeed.

**Commit**

Stage `app/page.tsx` only:

```
git add app/page.tsx
```

Commit with the following Conventional Commits message verbatim:

```
feat(tasks): add Today quick-filter button for last 24h
```

Do not amend, do not force-push, do not run any other git command in this task.

## Out of scope

- Persisting `filterToday` across reloads.
- Changing the meaning of "Today" to calendar-day semantics (midnight-to-now). The issue specifies "last 24 hours".
- Adding similar quick filters for "this week", "overdue", etc.
- Refactoring the existing filter chain into a separate hook or module.
- Any change to `app/db.ts`, `app/types.ts`, `app/components/MainLayout.tsx`, or the stub pages.
- Adding automated tests. The repository explicitly has no test suite and this plan does not introduce one.
