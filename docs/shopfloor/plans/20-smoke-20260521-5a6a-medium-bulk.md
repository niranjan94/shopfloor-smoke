# Plan: bulk-select and delete tasks

Issue: [#20](https://github.com/niranjan94/shopfloor-smoke/issues/20) — `smoke-20260521-5a6a-medium-bulk`

## Goal

Add a "bulk-select" mode to the tasks list on `app/page.tsx`. When the mode is on, every task card shows a checkbox and a "Bulk action" bar appears with a "Delete selected (N)" button that calls `db.deleteTask(id)` for every checked task, then drops them from the `tasks` React state. Toggling the mode off clears all selections.

Scope (locked by the issue body):

- Touch **only** `app/page.tsx` and add **at most one** new component file under `app/components/`.
- **No** schema changes, **no** new persistence fields.
- Selection state is **local React state** that resets when bulk-select is toggled off.

## Design decisions (medium flow — no spec file)

These are the decisions the implementer must follow. They are derived directly from the issue body and the existing code shape in `app/page.tsx`.

1. **Selection state shape.** `selectedIds: Set<string>` held in `useState`. A `Set` is chosen so add/remove/has/size are O(1) and the existing single-delete handler at `app/page.tsx:189` already keys tasks by `id`.
2. **Bulk-select-mode toggle.** New boolean state `bulkSelect: boolean`, defaulting to `false`. A button in the task-list header (currently `<h2>{filtered.length} {filtered.length === 1 ? "Task" : "Tasks"}</h2>`, `app/page.tsx:452`) toggles it. The button label is `"Select"` when off and `"Cancel"` when on. Use `className="btn btn-ghost btn-sm"` when off and `className="btn btn-muted btn-sm"` when on, to match existing button styling.
3. **Toggling the mode off clears the selection.** Implemented in a single `toggleBulkSelect` handler that flips `bulkSelect` and, if the new value is `false`, sets `selectedIds` to a new empty `Set<string>()`. (Spec from issue: "Selection state ... resets when bulk-select is toggled off.")
4. **Per-card checkbox placement.** When `bulkSelect === true`, a native `<input type="checkbox">` is rendered **before** the existing status-cycle button inside each card's top flex row (`app/page.tsx:467`). When `bulkSelect === false`, no checkbox is rendered and the card layout is unchanged.
5. **Checkbox behavior.** `checked={selectedIds.has(task.id)}`. `onChange` calls `toggleSelected(task.id)`, which produces a **new** `Set` (immutability) — add the id if absent, remove it if present — and stores it via `setSelectedIds`.
6. **Bulk action bar.** A new component `BulkActionBar` lives at `app/components/BulkActionBar.tsx`. It is rendered immediately above the task list (between the filters card at `app/page.tsx:447` and the `<div>` that wraps the list header at `app/page.tsx:450`), **only** when `bulkSelect === true`. It receives `count: number`, `onDeleteSelected: () => void`, and `onCancel: () => void` as props. It shows `Selected: {count}` on the left, and on the right a "Delete selected" button (`className="btn btn-danger btn-sm"`, `disabled={count === 0}`) plus a "Cancel" button (`className="btn btn-ghost btn-sm"`).
7. **Bulk delete behavior.** New async handler `handleBulkDelete()` on `Home`:
   - Snapshots `Array.from(selectedIds)` into a local `const ids`.
   - For each `id` in `ids`, `await db.deleteTask(id)` inside a `try/catch` that mirrors `handleDelete` (`app/page.tsx:189`): on error, `console.error(e)` and continue with the rest. (Sequential, not parallel — matches the rest of the file's style and avoids an `Promise.all` failure aborting partial deletes.)
   - After the loop, `setTasks((prev) => prev.filter((t) => !selectedIds.has(t.id)))`.
   - Then `setSelectedIds(new Set())` to clear the selection.
   - Leaves `bulkSelect` unchanged (the user stays in select mode so they can select more, matching the issue wording "removes every checked task ... and updates the React `tasks` state" without prescribing mode exit).
8. **Filter interaction.** The "Delete selected" button only operates on `selectedIds`, regardless of the current filter set, because selections are made by clicking checkboxes that are already filtered. No new logic is needed for filtering.
9. **Editing & bulk mode.** No interaction added — the existing Edit/Delete per-card buttons remain visible and functional in bulk mode. The issue scope does not call for hiding them, and removing them would be out of scope.
10. **No persistence.** `selectedIds` and `bulkSelect` are never written to IndexedDB. `app/db.ts` is not modified.

## Testing strategy

This project has **no automated test suite** (confirmed in `CLAUDE.md`: "No tests: this is a smoke test target, not a tested app. There is no test suite."). `package.json` defines `lint`, `dev`, `build`, and exposes `tsc` via `pnpm exec tsc`. The verification layers that apply to this plan are:

- **Type check** — `pnpm exec tsc --noEmit`. Must report 0 errors.
- **Lint** — `pnpm lint`. Must report 0 errors and 0 new warnings on the modified/created files.
- **Production build** — `pnpm build`. Must complete with exit code 0.
- **Manual smoke in dev server** — `pnpm dev`, then exercise the new flow in a browser at `http://localhost:3000`. The exact smoke script is given inline in each feature task.

There is no unit/integration/E2E layer to invoke; do not introduce one. The TDD shape's "failing test first" steps are therefore **skipped per the spec-absent exception** for this codebase (testable behavior is reviewed via manual smoke + tsc + lint + build).

---

## Task 1 — Add `bulkSelect` mode state, header toggle button, and per-card checkboxes

**Type:** feature (UI scaffold; no destructive behavior wired yet).

**Affected files:**

- Modify: `app/page.tsx`

**Steps:**

1. In `Home()` (`app/page.tsx:126`), add two new `useState` hooks beneath the existing `const [loading, setLoading] = useState(true);` at `app/page.tsx:140`:

   ```tsx
   const [bulkSelect, setBulkSelect] = useState(false);
   const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
   ```

2. Add a `toggleBulkSelect` handler just below `resetForm` (`app/page.tsx:205`):

   ```tsx
   function toggleBulkSelect() {
     setBulkSelect((prev) => {
       const next = !prev;
       if (!next) setSelectedIds(new Set());
       return next;
     });
   }
   ```

3. Add a `toggleSelected` handler immediately below `toggleBulkSelect`:

   ```tsx
   function toggleSelected(id: string) {
     setSelectedIds((prev) => {
       const next = new Set(prev);
       if (next.has(id)) next.delete(id);
       else next.add(id);
       return next;
     });
   }
   ```

4. Modify the task-list header row at `app/page.tsx:451`. Replace the line:

   ```tsx
   <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.875rem" }}>
     <h2>{filtered.length} {filtered.length === 1 ? "Task" : "Tasks"}</h2>
   </div>
   ```

   with:

   ```tsx
   <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.875rem" }}>
     <h2>{filtered.length} {filtered.length === 1 ? "Task" : "Tasks"}</h2>
     <button
       className={bulkSelect ? "btn btn-muted btn-sm" : "btn btn-ghost btn-sm"}
       onClick={toggleBulkSelect}
     >
       {bulkSelect ? "Cancel" : "Select"}
     </button>
   </div>
   ```

5. Add a per-card checkbox inside the existing card's top flex row at `app/page.tsx:467`. Locate the JSX:

   ```tsx
   <div style={{ display: "flex", alignItems: "flex-start", gap: "0.875rem" }}>
     {/* Status toggle */}
     <button
       onClick={() => cycleStatus(task)}
   ```

   Insert the following `{bulkSelect && (...)}` block as the **first child** of that flex row, before the `{/* Status toggle */}` comment:

   ```tsx
   {bulkSelect && (
     <input
       type="checkbox"
       checked={selectedIds.has(task.id)}
       onChange={() => toggleSelected(task.id)}
       aria-label={`Select task: ${task.title}`}
       style={{
         flexShrink: 0,
         marginTop: "4px",
         width: 18,
         height: 18,
         cursor: "pointer",
       }}
     />
   )}
   ```

6. **Verification (manual smoke + automated checks).** From the repo root:

   ```
   pnpm install
   pnpm exec tsc --noEmit
   pnpm lint
   pnpm dev
   ```

   In a browser at `http://localhost:3000`:
   - Confirm the task list still renders normally. The card layout (status circle, content, Edit/Delete) is unchanged.
   - A "Select" button is visible to the right of the `N Tasks` heading.
   - Click "Select". The button label becomes "Cancel" and a checkbox appears at the left of every visible card. Checkboxes are unchecked.
   - Toggle a checkbox on, then off. `selectedIds` is internal — verify visually that the checkbox's checked state matches your clicks.
   - Toggle a checkbox on, then click "Cancel". The mode exits, checkboxes disappear, and on re-entering bulk mode (click "Select" again) the checkbox is **unchecked** — confirming the selection reset.

   Stop the dev server. `pnpm exec tsc --noEmit` and `pnpm lint` must both exit 0.

7. **Commit:**

   ```
   feat(tasks): add bulk-select mode toggle and per-card checkboxes
   ```

---

## Task 2 — Add `BulkActionBar` component, wire bulk delete

**Type:** feature (destructive behavior — calls `db.deleteTask`).

**Affected files:**

- Create: `app/components/BulkActionBar.tsx`
- Modify: `app/page.tsx`

**Steps:**

1. Create `app/components/BulkActionBar.tsx` with the **complete** following contents:

   ```tsx
   "use client";

   export function BulkActionBar({
     count,
     onDeleteSelected,
     onCancel,
   }: {
     count: number;
     onDeleteSelected: () => void;
     onCancel: () => void;
   }) {
     return (
       <div
         className="glass"
         style={{
           padding: "0.75rem 1rem",
           marginBottom: "0.875rem",
           display: "flex",
           alignItems: "center",
           justifyContent: "space-between",
           gap: "0.75rem",
         }}
       >
         <div style={{ color: "var(--text-primary)", fontSize: "0.875rem" }}>
           Selected: {count}
         </div>
         <div style={{ display: "flex", gap: "0.375rem" }}>
           <button
             className="btn btn-danger btn-sm"
             onClick={onDeleteSelected}
             disabled={count === 0}
           >
             Delete selected
           </button>
           <button className="btn btn-ghost btn-sm" onClick={onCancel}>
             Cancel
           </button>
         </div>
       </div>
     );
   }
   ```

2. In `app/page.tsx`, add the import below the existing `import { MainLayout } from "./components/MainLayout";` at line 6:

   ```tsx
   import { BulkActionBar } from "./components/BulkActionBar";
   ```

3. Add a `handleBulkDelete` async handler immediately below the `toggleSelected` handler added in Task 1:

   ```tsx
   async function handleBulkDelete() {
     const ids = Array.from(selectedIds);
     for (const id of ids) {
       try {
         await db.deleteTask(id);
       } catch (e) {
         console.error(e);
       }
     }
     setTasks((prev) => prev.filter((t) => !selectedIds.has(t.id)));
     setSelectedIds(new Set());
   }
   ```

4. Render the action bar above the task-list section. Locate the line at `app/page.tsx:450` that begins the task-list container:

   ```tsx
   {/* Task list */}
   <div>
     <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.875rem" }}>
   ```

   Insert this block **immediately before** the `{/* Task list */}` comment:

   ```tsx
   {bulkSelect && (
     <BulkActionBar
       count={selectedIds.size}
       onDeleteSelected={handleBulkDelete}
       onCancel={toggleBulkSelect}
     />
   )}
   ```

5. **Verification (manual smoke + automated checks).** From the repo root:

   ```
   pnpm exec tsc --noEmit
   pnpm lint
   pnpm dev
   ```

   In a browser at `http://localhost:3000`:
   - Ensure at least three tasks exist (create them via the "New Task" form if needed).
   - Click "Select". The `BulkActionBar` appears above the task list, showing `Selected: 0`. The "Delete selected" button is disabled.
   - Check two cards. The bar updates to `Selected: 2` and "Delete selected" becomes enabled.
   - Click "Delete selected". Both checked tasks disappear from the list. `Selected:` resets to `0`. The remaining tasks are unchanged.
   - Stat counters at the top (Total / To Do / In Progress / Done) decrease accordingly.
   - Hard-refresh the browser (Cmd/Ctrl+Shift+R). The deleted tasks **stay** deleted (proves `db.deleteTask` ran).
   - Click "Select" again, then click the bar's "Cancel" button. The bar disappears, mode exits, and checkboxes disappear.

6. Stop the dev server. Then:

   ```
   pnpm exec tsc --noEmit
   pnpm lint
   pnpm build
   ```

   All three must exit 0.

7. **Commit:**

   ```
   feat(tasks): wire bulk-delete action bar to db.deleteTask
   ```

---

## Out of scope (do not implement)

- Confirm-before-delete dialog (issue does not require it).
- "Select all" / "Invert selection" affordances.
- Keyboard shortcuts.
- Persisting `bulkSelect` or `selectedIds` to IndexedDB (explicitly forbidden by the issue).
- Modifying `app/db.ts`, `app/types.ts`, or any stub page.
- Adding a test runner or test files (no test surface exists; do not invent one).

## Rollback

Each task is a single commit. Revert in reverse order if needed:

1. `git revert <commit-of-task-2>` removes `BulkActionBar` integration; the toggle and checkboxes remain but are no-op for delete.
2. `git revert <commit-of-task-1>` restores `app/page.tsx` to the pre-feature state.

Then `rm app/components/BulkActionBar.tsx` if it still exists.
