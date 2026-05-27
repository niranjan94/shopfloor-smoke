# Plan — Today quick-filter button for tasks list

Issue: niranjan94/shopfloor-smoke#123
Flow: medium (no spec file present; design derived from issue body + triage comment)

## Overview

Add a "Today" quick-filter toggle to the tasks list filters section on `app/page.tsx`. When active, the visible task list is restricted to tasks whose `createdAt` ISO timestamp is within the last 24 hours (`Date.now() - 86_400_000`). The filter composes with the existing status / category / priority / search filters via AND.

Touch-points (all in `app/page.tsx`):

1. New client state `filterToday: boolean`, initial value `false`.
2. New `<button>` rendered inside the existing filters grid that toggles `filterToday` and shows its active/inactive state via Tailwind/CSS classes already defined in `app/globals.css` (`btn`, `btn-primary`, `btn-muted`, `btn-sm`).
3. Extension of the existing `filtered` predicate chain: when `filterToday` is `true`, reject any task whose `new Date(t.createdAt).getTime()` is less than `Date.now() - 86_400_000`.

No changes to `app/types.ts`, `app/db.ts`, or the IndexedDB schema: `Task.createdAt` is already a required ISO string (verified at `app/types.ts:9` and `app/page.tsx:79`).

## Testing strategy

This project has **no automated test suite** (confirmed in `CLAUDE.md`: "No tests: this is a smoke test target, not a tested app. There is no test suite."). The verification layers available, and how each is used in this plan, are:

| Layer | Runner command | Used for |
| --- | --- | --- |
| Type check | `pnpm exec tsc --noEmit` | Catch type regressions in the modified `app/page.tsx`. |
| Lint | `pnpm lint` | Enforce existing ESLint config (`eslint-config-next`). |
| Production build | `pnpm build` | Confirm Next.js still compiles the page. |
| Manual UI smoke | `pnpm dev` → http://localhost:3000 | Exercise the new toggle in a browser (golden path + a regression check on existing filters). |

Unit / integration / e2e layers are **skipped — project has no such suite and adding one is out of scope for this issue.**

Every feature task below verifies via the four layers above (type check + lint + build + manual smoke). The commit for the feature task happens after all four pass.

## Task 1 — Add `filterToday` state, predicate, and toggle button to the tasks list

**Files**

- Modify: `app/page.tsx`
- Create: (none)
- Test: (none — no automated test layer applies; verification is type check + lint + build + manual smoke per the testing strategy)

**Steps**

1. (Spec-absent / no automated test layer applies — TDD steps 1–2 do not apply. Proceed directly to step 3. Manual smoke in step 5 replaces an automated failing-test step.)

2. (See step 1.)

3. Implement the change in `app/page.tsx`:

   a. Add a new state hook immediately after the `sortBy` hook declaration at `app/page.tsx:46`:

   ```tsx
   const [filterToday, setFilterToday] = useState(false);
   ```

   Insert it as a new line between the `sortBy` line and the `loading` line so the diff is:

   ```tsx
   const [sortBy, setSortBy] = useState<"created" | "dueDate" | "priority">("created");
   const [filterToday, setFilterToday] = useState(false);
   const [loading, setLoading] = useState(true);
   ```

   b. Extend the `filtered` predicate at `app/page.tsx:130-140`. Add the new check as the **last** predicate before `return true;`, so it composes via AND with existing filters:

   ```tsx
   const filtered = tasks
     .filter((t) => {
       if (filterStatus !== "all" && t.status !== filterStatus) return false;
       if (filterCategory !== "all" && t.category !== filterCategory) return false;
       if (filterPriority !== "all" && t.priority !== filterPriority) return false;
       if (searchQuery) {
         const q = searchQuery.toLowerCase();
         if (!t.title.toLowerCase().includes(q) && !t.description?.toLowerCase().includes(q)) return false;
       }
       if (filterToday) {
         const cutoff = Date.now() - 86_400_000;
         if (new Date(t.createdAt).getTime() < cutoff) return false;
       }
       return true;
     })
   ```

   The `.sort(...)` call that follows is **not** modified.

   c. Render the toggle button inside the existing filters grid at `app/page.tsx:251-273`. Change the grid from four columns to five columns, and append the button as the fifth child after the `sortBy` `<select>`. Replace the existing block:

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

   With:

   ```tsx
   <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0.75rem" }}>
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
     <button
       type="button"
       className={`btn ${filterToday ? "btn-primary" : "btn-muted"}`}
       aria-pressed={filterToday}
       onClick={() => setFilterToday((v) => !v)}
     >
       Today
     </button>
   </div>
   ```

   No other lines in `app/page.tsx` change. Do not touch the search `<input>` above this block, the form section, the stats section, the task list section, or any helper function.

4. Run the verification layers from the testing strategy in this order. **All four must pass before committing.** Treat any failure as a blocker — investigate and fix the underlying cause in `app/page.tsx`; do not commit a partially-passing change.

   a. `pnpm exec tsc --noEmit`
      - Expected: exit code 0, no output.
      - If it fails, the most likely cause is a typo in `filterToday` or `setFilterToday`, or a mismatched JSX brace in the new button block. Fix in `app/page.tsx`.

   b. `pnpm lint`
      - Expected: exit code 0, no warnings or errors. The `eslint-config-next` config is strict about unused variables and React hooks.
      - If `aria-pressed` triggers a jsx-a11y warning that is not already present elsewhere in the file, drop the `aria-pressed` attribute rather than adding a new lint disable.

   c. `pnpm build`
      - Expected: exit code 0. Next.js prints `✓ Compiled successfully` and a route table that includes `/`.

   d. Manual UI smoke via `pnpm dev` at http://localhost:3000:
      - **Golden path.** Create three tasks; the `createdAt` of each will be the moment of creation (within the last 24h). Click "Today". Expected: all three tasks remain visible, the button switches from the muted style (`btn-muted`) to the gold primary style (`btn-primary`), and the task count above the list is unchanged. Click "Today" again. Expected: button returns to muted style, list is unchanged.
      - **Edge case — old task is filtered out.** Open the browser devtools, switch to the **Application → IndexedDB → TodoApp → tasks** store, and manually edit the `createdAt` field of one existing task to an ISO string from two days ago (e.g. `2026-05-25T12:00:00.000Z`). Refresh the page. Click "Today". Expected: the edited task disappears from the visible list and the task-count header decreases by one. Toggle "Today" off; the task reappears.
      - **Regression check — composes with existing filters.** With "Today" active, change the status filter to "Done". Expected: list narrows further (only tasks that are both within 24h AND `done`). Clear the search box, change category and priority filters — each existing filter still works in conjunction with "Today".
      - **Regression check — initial render.** Reload the page. Expected: button starts in the muted (inactive) style; all tasks are visible by default.

   Stop the dev server once smoke is complete.

5. Commit. **Stage only `app/page.tsx`.** Use the exact Conventional Commits message:

   ```
   feat(tasks): add Today quick-filter button to tasks list
   ```

## Task 2 — (none)

There is no second task. The feature, its verification, and its commit are entirely contained in Task 1 because the three touch-points (state, predicate, button) are tightly coupled and changing any one without the others produces a non-functional intermediate state. Atomicity is preserved by keeping the change scoped to a single file and a single commit.

## Out of scope

- Persisting `filterToday` across reloads (state is intentionally session-only, matching the other filter states in `app/page.tsx`).
- Showing a numeric badge of "tasks created today" on the button.
- Changing the existing `Task.createdAt` representation in `app/types.ts` or the IndexedDB schema in `app/db.ts`.
- Adding any test infrastructure (unit, integration, or e2e). The project explicitly has none; introducing it is a separate initiative.
