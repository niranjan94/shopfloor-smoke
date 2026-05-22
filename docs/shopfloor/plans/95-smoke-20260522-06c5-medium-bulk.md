# Plan — Bulk-select and delete tasks (#95)

Add a bulk-select mode to the tasks list. Toggling the mode reveals a checkbox on
every task card and a "Delete selected" action that fans out `db.deleteTask` calls
and prunes the React `tasks` state. Selection state is local React state and is
discarded whenever bulk-select mode is toggled off.

Scope, fixed by the issue: `app/page.tsx` plus exactly one new component file
under `app/components/`. No schema or persistence changes.

## Source

No spec file exists (medium-complexity flow). Decisions are derived from the
issue body and the triage comment on #95.

## Decisions

- **Toolbar location.** Per the triage comment, the toggle lives in the
  `## Task list` header (the existing flex row currently containing only the
  task-count `<h2>` at `app/page.tsx:279-281`). The "Delete selected" button and
  the selection counter render in the same toolbar, immediately below that
  header row, only while bulk-select mode is on.
- **One new component file.** The toolbar is extracted to
  `app/components/BulkActionToolbar.tsx`. The page passes `bulkSelectMode`,
  `selectedCount`, `onToggle`, and `onDeleteSelected` props; the component is
  presentational and holds no state of its own. The toggle button is part of
  the same component so the page only renders one element.
- **Selection state.** Two `useState` hooks in `Home`:
  `bulkSelectMode: boolean` (default `false`) and
  `selectedIds: Set<string>` (default `new Set()`). Toggling bulk-select off
  resets `selectedIds` to a fresh empty `Set`.
- **Checkbox placement.** The checkbox renders inside the task card's
  flex row, immediately before the status-toggle circle button
  (`app/page.tsx:297-319`), and only when `bulkSelectMode` is true. It uses a
  native `<input type="checkbox">` with `flexShrink: 0` and a small top margin
  so it aligns with the status circle.
- **Delete fan-out.** `handleBulkDelete` iterates `selectedIds`, calls
  `db.deleteTask(id)` for each via `Promise.all`, then does a single
  `setTasks((prev) => prev.filter((t) => !selectedIds.has(t.id)))` and clears
  `selectedIds`. The fan-out mirrors the single-row `handleDelete` pattern at
  `app/page.tsx:95-99` and uses the same try/catch + `console.error` style
  used elsewhere in the file.
- **Disabled state.** "Delete selected" is `disabled` when `selectedIds.size === 0`.
- **No confirm dialog.** The existing per-row delete at `app/page.tsx:362-364`
  has no confirmation, so the bulk variant matches.
- **Filter interaction.** `selectedIds` may contain ids of tasks that the
  current filter hides. `handleBulkDelete` deletes by id regardless of
  visibility; this matches the user's prior selection intent.

## Testing strategy

The project has no automated test suite (see `CLAUDE.md` and the absence of
any `test`/`spec` directory or test script in `package.json`). The available
verification surface is:

- **Lint.** `pnpm lint` (script: `eslint`). Required to pass.
- **Type-check.** `pnpm exec tsc --noEmit`. Required to pass.
- **Manual browser verification.** `pnpm dev` then exercise the feature at
  `http://localhost:3000`. Required for any task that changes UI behavior.

There is no unit, integration, or E2E layer available; tasks below therefore
omit the failing-test-first step (TDD step 1 of the methodology). Each task
that changes production behavior instead specifies the exact manual scenarios
to walk through after `pnpm dev` is running, plus the mandatory `pnpm lint`
and `pnpm exec tsc --noEmit` runs. This is the spec-absent fallback the
methodology allows when neither a spec nor the codebase names a test layer.

## Task 1 — Add `BulkActionToolbar` component

**Files**

- Create: `app/components/BulkActionToolbar.tsx`
- Modify: (none)
- Test: (none — purely additive, no consumers yet; Task 2 wires it in)

**Goal.** Add a presentational toolbar component used by `app/page.tsx` in
Task 2. The component is dumb: it renders a toggle button and, when bulk-select
is on, a "Delete selected" button plus a selection counter. It owns no state
and calls back to the parent for both actions.

**Exact contents.** Write the file with exactly this content (no elisions):

```tsx
"use client";

export interface BulkActionToolbarProps {
  bulkSelectMode: boolean;
  selectedCount: number;
  onToggle: () => void;
  onDeleteSelected: () => void;
}

export function BulkActionToolbar({
  bulkSelectMode,
  selectedCount,
  onToggle,
  onDeleteSelected,
}: BulkActionToolbarProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        flexWrap: "wrap",
      }}
    >
      <button
        type="button"
        className={bulkSelectMode ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
        onClick={onToggle}
      >
        {bulkSelectMode ? "Cancel" : "Select"}
      </button>
      {bulkSelectMode && (
        <>
          <span style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
            {selectedCount} selected
          </span>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={onDeleteSelected}
            disabled={selectedCount === 0}
          >
            Delete selected
          </button>
        </>
      )}
    </div>
  );
}
```

**Verification.**

1. `pnpm exec tsc --noEmit` — must pass with no errors. The new file should
   type-check on its own; if it does not, fix the file before continuing.
2. `pnpm lint` — must pass with no errors or warnings touching the new file.
3. Skip manual browser verification: the component has no consumer until
   Task 2.

**Commit message (use verbatim).**

```
feat(tasks): add BulkActionToolbar component
```

## Task 2 — Wire bulk-select state and checkboxes into the tasks page

**Files**

- Create: (none)
- Modify: `app/page.tsx`
- Test: (manual — no test files exist; verification steps below)

**Goal.** Add the `bulkSelectMode` + `selectedIds` state, render the
`BulkActionToolbar` in the task-list header, render a checkbox on each task
card while bulk-select is on, and implement `handleBulkDelete` that fans out
`db.deleteTask` and prunes `tasks` state.

**Changes.** All edits are inside the existing `Home` function in
`app/page.tsx`.

1. **Import the toolbar.** Add this import alongside the existing
   `MainLayout` import at `app/page.tsx:6`:

   ```tsx
   import { BulkActionToolbar } from "./components/BulkActionToolbar";
   ```

2. **Add state.** Immediately after the `loading` state declaration at
   `app/page.tsx:47`, add:

   ```tsx
   const [bulkSelectMode, setBulkSelectMode] = useState(false);
   const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
   ```

3. **Add handlers.** After `handleDelete` (which ends at `app/page.tsx:100`)
   add three new functions inside `Home`:

   ```tsx
   function toggleBulkSelectMode() {
     setBulkSelectMode((prev) => {
       const next = !prev;
       if (!next) setSelectedIds(new Set());
       return next;
     });
   }

   function toggleSelected(id: string) {
     setSelectedIds((prev) => {
       const next = new Set(prev);
       if (next.has(id)) next.delete(id);
       else next.add(id);
       return next;
     });
   }

   async function handleBulkDelete() {
     if (selectedIds.size === 0) return;
     const ids = Array.from(selectedIds);
     try {
       await Promise.all(ids.map((id) => db.deleteTask(id)));
       setTasks((prev) => prev.filter((t) => !selectedIds.has(t.id)));
       setSelectedIds(new Set());
     } catch (e) {
       console.error(e);
     }
   }
   ```

4. **Render the toolbar in the task-list header.** Replace the current
   header row at `app/page.tsx:279-281`:

   ```tsx
   <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.875rem" }}>
     <h2>{filtered.length} {filtered.length === 1 ? "Task" : "Tasks"}</h2>
   </div>
   ```

   with:

   ```tsx
   <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.875rem", gap: "0.75rem", flexWrap: "wrap" }}>
     <h2>{filtered.length} {filtered.length === 1 ? "Task" : "Tasks"}</h2>
     <BulkActionToolbar
       bulkSelectMode={bulkSelectMode}
       selectedCount={selectedIds.size}
       onToggle={toggleBulkSelectMode}
       onDeleteSelected={handleBulkDelete}
     />
   </div>
   ```

5. **Render a checkbox on each task card.** Inside the task-card flex row
   (the `<div>` that starts at `app/page.tsx:295` with
   `style={{ display: "flex", alignItems: "flex-start", gap: "0.875rem" }}`),
   add a checkbox as the first child, immediately before the existing
   status-toggle button at `app/page.tsx:297-319`. Insert this block as the
   new first child of that flex row:

   ```tsx
   {bulkSelectMode && (
     <input
       type="checkbox"
       checked={selectedIds.has(task.id)}
       onChange={() => toggleSelected(task.id)}
       aria-label={`Select task ${task.title}`}
       style={{
         flexShrink: 0,
         marginTop: "5px",
         width: 16,
         height: 16,
         cursor: "pointer",
       }}
     />
   )}
   ```

   The checkbox renders before the status-toggle circle so visual order is:
   checkbox, status circle, content, action buttons. The existing
   status-toggle button and the per-row Edit/Delete buttons stay untouched
   and remain clickable in bulk-select mode (this matches the issue's intent
   — bulk-select is additive, it does not disable existing actions).

**Verification.**

1. `pnpm exec tsc --noEmit` — must pass with no errors.
2. `pnpm lint` — must pass with no errors or warnings.
3. `pnpm dev` and load `http://localhost:3000`. Walk these scenarios:
   - With at least three seeded tasks on the page, click **Select** in the
     task-list header. Confirm a checkbox appears on every task card, the
     button switches to **Cancel**, and a "0 selected" counter plus a disabled
     **Delete selected** button appear next to it.
   - Tick two task cards. Confirm the counter reads "2 selected" and
     **Delete selected** becomes enabled.
   - Click **Delete selected**. Confirm both tasks vanish from the list, the
     counter resets to "0 selected", and **Delete selected** is disabled
     again.
   - Reload the page. Confirm the deleted tasks are still gone (IndexedDB
     persisted the deletion).
   - Tick one remaining task, then click **Cancel**. Confirm the checkboxes
     disappear, the toolbar collapses back to a single **Select** button, and
     clicking **Select** again shows the counter at "0 selected" (state was
     reset on toggle-off).
   - With bulk-select on and at least one task ticked, click the per-row
     **Edit** button on a different (unticked) task. Confirm the form
     populates as before and selection state is untouched.
   - With bulk-select on, click a task card's status-toggle circle. Confirm
     status cycles (todo → in-progress → done → todo) as before and the
     checkbox state on that card is untouched.
   - Filter the list (e.g. set status filter to "Done"), then bulk-delete a
     visible task. Confirm only the deleted task disappears and other
     filtered/hidden tasks are unaffected.

**Commit message (use verbatim).**

```
feat(tasks): add bulk-select mode with delete-selected action
```

## Out of scope (explicitly deferred)

- Select-all / clear-all controls (not in issue scope; selection is
  per-card only).
- A confirmation dialog before bulk delete (mirrors existing per-row delete,
  which has none).
- Keyboard shortcuts (e.g. shift-click range select).
- Persisting selection across reloads (issue states selection is local React
  state and resets on toggle-off).
- Bulk status updates or bulk category changes (issue scope is delete only).

If a reviewer requests any of these, open a follow-up issue rather than
expanding this PR.
