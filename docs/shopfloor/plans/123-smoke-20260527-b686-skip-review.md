# Plan — Today quick-filter button on tasks list

Issue: niranjan94/shopfloor-smoke#123

## Goal

Add a "Today" quick-filter toggle button to the tasks list page. When enabled, it
restricts the visible list to tasks whose `createdAt` is within the last 24 hours
(rolling window from `Date.now()`). The toggle composes with the existing
status / category / priority / search filters and with sorting; it does not
replace or override them.

All work happens in `app/page.tsx`. No schema, DB, type, or layout changes are
required — `Task.createdAt` (ISO string) already exists.

## Testing strategy

This project has no automated test suite (confirmed by `CLAUDE.md`:
"No tests: this is a smoke test target, not a tested app"). `package.json`
exposes only `dev`, `build`, `start`, and `lint` scripts. Verification for
feature work therefore uses the layers below, in this order:

1. **Type check** — `pnpm exec tsc --noEmit`. Must report zero errors.
2. **Lint** — `pnpm lint`. Must report zero errors and zero new warnings.
3. **Production build** — `pnpm build`. Must complete successfully.
4. **Manual UI smoke** — `pnpm dev`, open `http://localhost:3000`, exercise the
   golden path and edge cases listed in Task 1's verification steps. Because
   there is no test runner, this manual pass is the only behavioral check; it
   is mandatory, not optional.

No new test layer is introduced. Steps 1 and 2 (write failing test / observe
red) of the standard TDD shape are skipped for this task because no test
runner exists in this project; this is the documented "no automated tests"
exception. Verification still runs steps 3–5 (production change → green
checks → commit).

## Task 1 — Add `filterToday` state, toggle button, and 24-hour predicate

**Scope:** one atomic change in `app/page.tsx` that introduces the `filterToday`
boolean state, renders a toggle button inside the existing filters grid, and
extends the `filtered` predicate with a 24-hour `createdAt` check. All three
edits land in one commit because they form a single user-visible behavior and
cannot be reviewed independently (state without UI is dead code; UI without
predicate does nothing).

**Affected files:**

- Modify: `app/page.tsx`
- Create: (none)
- Test: (none — no test runner; see Testing strategy)

**Exception applied:** TDD red phase skipped — project has no automated test
suite. Manual UI smoke replaces automated assertions and is required.

### Step 1 — Add the state hook

In `app/page.tsx`, immediately after the existing `filterPriority` state
declaration (currently at line 44):

```tsx
const [filterPriority, setFilterPriority] = useState("all");
```

insert this new line on the next line:

```tsx
const [filterToday, setFilterToday] = useState(false);
```

Place it before `searchQuery` so the filter-related state stays grouped. Do
not change any other `useState` call.

### Step 2 — Extend the `filtered` predicate

Locate the `.filter((t) => { ... })` block that begins at the current line 131.
After the `filterPriority` check and before the `searchQuery` check, insert a
24-hour window check so the predicate reads exactly:

```tsx
const filtered = tasks
  .filter((t) => {
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (filterCategory !== "all" && t.category !== filterCategory) return false;
    if (filterPriority !== "all" && t.priority !== filterPriority) return false;
    if (filterToday) {
      const cutoff = Date.now() - 86_400_000;
      if (new Date(t.createdAt).getTime() < cutoff) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!t.title.toLowerCase().includes(q) && !t.description?.toLowerCase().includes(q)) return false;
    }
    return true;
  })
```

Notes:

- The cutoff is computed inside the predicate so the window is fresh on every
  render. This is acceptable: `tasks` is small (client-side IndexedDB), and
  recomputing `Date.now()` once per filter pass is cheap.
- Use `new Date(t.createdAt).getTime()` (not `Date.parse`) for parity with the
  existing `sortBy === "created"` comparator (line 150), which already calls
  `new Date(...).getTime()` on `createdAt`.
- Do not touch the `.sort(...)` block.

### Step 3 — Render the toggle button in the filters grid

The filters block currently contains an outer flex column (line 243) holding
the search input and a 4-column grid of `<select>` elements (line 251). Replace
the existing inner grid container so it accommodates the toggle button as a
fifth control while keeping the existing four selects unchanged in markup.

Replace this block:

```tsx
<div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem" }}>
  <select className="input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)}>
    <option value="all">All Status</option>
    <option value="todo">To Do</option>
    <option value="in-progress">In Progress</option>
    <option value="done">Done</option>
  </select>
  <select className="input" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
    <option value="all">All Categories</option>
    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
  </select>
  <select className="input" value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
    <option value="all">All Priorities</option>
    <option value="high">High</option>
    <option value="medium">Medium</option>
    <option value="low">Low</option>
  </select>
  <select className="input" value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
    <option value="created">Newest first</option>
    <option value="dueDate">Due date</option>
    <option value="priority">Priority</option>
  </select>
</div>
```

with this block:

```tsx
<div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem" }}>
  <select className="input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)}>
    <option value="all">All Status</option>
    <option value="todo">To Do</option>
    <option value="in-progress">In Progress</option>
    <option value="done">Done</option>
  </select>
  <select className="input" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
    <option value="all">All Categories</option>
    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
  </select>
  <select className="input" value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
    <option value="all">All Priorities</option>
    <option value="high">High</option>
    <option value="medium">Medium</option>
    <option value="low">Low</option>
  </select>
  <select className="input" value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
    <option value="created">Newest first</option>
    <option value="dueDate">Due date</option>
    <option value="priority">Priority</option>
  </select>
</div>
<button
  type="button"
  className={filterToday ? "btn btn-primary" : "btn btn-muted"}
  aria-pressed={filterToday}
  onClick={() => setFilterToday((v) => !v)}
  style={{ alignSelf: "flex-start" }}
>
  Today
</button>
```

Notes:

- The button is a sibling of the 4-column grid inside the existing flex column
  (`flexDirection: "column"`, `gap: "0.75rem"` at line 243), so it renders on
  its own row below the selects without disturbing the 4-column layout.
- Active state uses `btn btn-primary`; inactive uses `btn btn-muted`. Both
  classes already exist in this codebase (search input at line 234 uses
  `btn-muted`; form save button at line 229 uses `btn-primary`). Do not invent
  new CSS.
- `aria-pressed` reflects the toggle state for accessibility — matches the
  existing pattern of the status-cycle button (line 297) communicating state
  through styling rather than text changes.
- Do not add a separate "Clear" affordance. Clicking the button again
  un-toggles it; that is the documented dismissal.

### Step 4 — Verify

Run, in order, from the repository root:

1. `pnpm exec tsc --noEmit`
   - Expected: completes with no output and exit code 0.
2. `pnpm lint`
   - Expected: completes with no errors and no new warnings introduced by
     this change. The `as any` casts already present on lines 252 and 268
     remain — do not "fix" them in this task.
3. `pnpm build`
   - Expected: a successful Next.js production build. The `/` route appears
     in the route summary; no build errors.
4. Manual UI smoke against `pnpm dev` at `http://localhost:3000`:
   - **Golden path.** Add three tasks via the form. Confirm all three are
     visible. Click **Today**; confirm the button visibly switches to the
     primary (gold) style, `aria-pressed="true"` is set (DevTools), and all
     three tasks remain visible (they were just created, so all are within
     the 24-hour window). Click **Today** again; confirm it returns to the
     muted style and `aria-pressed="false"`, and tasks remain visible.
   - **Old-task edge case.** In DevTools → Application → IndexedDB →
     `TodoApp` → `tasks`, edit one task's `createdAt` to an ISO timestamp
     more than 24 hours in the past (e.g., subtract two days). Reload the
     page. With **Today** off, all tasks (including the edited one) are
     listed. Toggle **Today** on; the edited task disappears while the
     others remain. Toggle off; it reappears.
   - **Composition with other filters.** With **Today** on, change the
     status select to `Done`. The visible list must be the intersection
     (recent AND done). Type a query in the search box; intersection still
     holds. Reset filters one at a time and confirm the count updates as
     expected.
   - **Empty-state copy.** With **Today** on and only old tasks present,
     the empty-state card must read `No tasks match your filters.` (the
     existing copy at line 285), not the first-load `No tasks yet…`
     message — `tasks.length > 0`, the filter just hides them.
   - **Regression.** Toggle each pre-existing filter (status, category,
     priority, sort, search) with **Today** off, and confirm none of their
     behaviors changed.
   - Report each of the five sub-checks as pass/fail in the PR
     description; do not mark the task complete unless all five pass.

### Step 5 — Commit

After all four verification steps pass, commit the change with this exact
message:

```
feat(tasks): add Today quick-filter for tasks created in last 24h
```

Use Conventional Commits format. Stage only `app/page.tsx` — no other file
should appear in the diff.

## Out of scope

The following are intentionally not in this plan; do not implement them as
part of this task.

- Persisting `filterToday` to `localStorage` or IndexedDB.
- Configurable windows ("Last 7 days", custom range).
- Filtering by `updatedAt` or `completedAt` instead of `createdAt`.
- Internationalising the "Today" label.
- Adding a generic `QuickFilter` component or extracting filter state into
  a reducer.
- Changes to the stub `dashboard`, `calendar`, `projects`, or `settings`
  pages.

If any of these become desirable, file a separate issue.
