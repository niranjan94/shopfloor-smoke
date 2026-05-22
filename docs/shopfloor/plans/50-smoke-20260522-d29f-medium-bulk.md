# Plan: Bulk-select and delete tasks (#50)

Issue: niranjan94/shopfloor-smoke#50
Slug: `smoke-20260522-d29f-medium-bulk`
Branch: `shopfloor/plan/50-smoke-20260522-d29f-medium-bulk`

No design spec exists for this issue. The plan is derived directly from the issue body and the triage comment (medium-complexity flow).

## Scope and constraints

From the issue body, fixed:

- UI + client-side selection state only. No schema changes, no new persistence fields.
- Touch `app/page.tsx` and **at most one** new component file under `app/components/`.
- Selection state is local React state. It must reset when bulk-select is toggled off.
- Bulk delete goes through `db.deleteTask` (one call per selected id) and then updates the React `tasks` state.

## Design decisions (resolved here)

These are the open questions the triage comment flagged. They are settled below so the implementer does not reopen them.

1. **One new component.** A new `app/components/BulkSelectBar.tsx` file is added. It owns the toolbar UI (Enter/Exit bulk mode button, selection count, "Delete selected" button). It is a presentational component — it receives state and callbacks as props and renders no app state of its own.
2. **Per-card checkbox stays in `page.tsx`.** The task card is rendered inline in `page.tsx` (lines 289-368 of the current file). Extracting just the checkbox into a component is not worth a second file; the checkbox is rendered as a sibling of the existing status-toggle button, only when `bulkSelect` is true.
3. **`selectedIds` representation.** A `Set<string>` stored in `useState<Set<string>>`. Updates always produce a *new* `Set` instance so React re-renders (`setSelectedIds(prev => { const next = new Set(prev); ...; return next; })`). A `Set` is chosen over an array because membership checks (`selectedIds.has(task.id)`) run on every render for every visible card.
4. **Toggle behavior.** Turning bulk-select **on** preserves any prior `selectedIds` (which will be empty on first entry). Turning bulk-select **off** clears `selectedIds` back to an empty `Set`. The issue explicitly requires the reset-on-off behavior; reset-on-on is not specified and is not added.
5. **Bulk delete.** Implemented with `await Promise.all(ids.map(id => db.deleteTask(id)))`, then a single `setTasks(prev => prev.filter(t => !idsSet.has(t.id)))`, then `setSelectedIds(new Set())`. Bulk mode is **not** automatically exited after a successful bulk delete — the user stays in bulk-select mode with an empty selection so they can continue selecting more tasks. (Exiting on delete would force the user to re-toggle the mode for every batch; the issue does not require that behavior.)
6. **"Delete selected" button enabled state.** The button is rendered whenever `bulkSelect` is true. It is disabled (`disabled` attribute + `btn-muted`-style appearance via inline `opacity: 0.5; cursor: not-allowed`) when `selectedIds.size === 0`. No confirmation dialog — the existing per-card Delete also has none, and adding one for bulk would be inconsistent.
7. **Where the toolbar lives.** The bar replaces the existing flex row that holds `<h2>{filtered.length} Tasks</h2>` (currently `page.tsx` lines 279-281). The heading stays on the left; the bulk-select controls sit on the right of the same flex row. This is the existing layout slot for that header so no surrounding markup changes.
8. **Checkbox placement on the card.** A native `<input type="checkbox">` is rendered as the **first child** of the card's inner flex row (currently `page.tsx` line 295), to the left of the status-toggle button, only when `bulkSelect` is true. The status-toggle button is *not* removed in bulk mode — both controls coexist. Clicking the checkbox toggles selection; clicking the status circle still cycles status. This avoids re-laying out the card.
9. **Hidden actions in bulk mode.** The per-card Edit and Delete buttons (lines 358-365) are **hidden** while `bulkSelect` is true. Reason: keeping them visible mixes single-task and bulk-task workflows on the same card and invites accidental single deletes mid-selection. The status-toggle button stays visible (it is a small affordance that doesn't conflict).
10. **Visible interaction during async delete.** While the bulk delete promise is in flight, set a local `bulkDeleting` boolean and disable the "Delete selected" button. This prevents a double-click from issuing two parallel delete batches against the same ids. No spinner — the deletes resolve quickly against IndexedDB.

## Testing strategy

The project has **no test suite** by design (see `CLAUDE.md` → "No tests: this is a smoke test target, not a tested app. There is no test suite."). The only automated verification layers available are:

| Layer            | Command          | Used by                                    |
| ---------------- | ---------------- | ------------------------------------------ |
| Lint             | `pnpm lint`      | Every code task                            |
| Type check       | `pnpm exec tsc --noEmit` | Every code task                    |
| Production build | `pnpm build`     | The final verification task                |
| Manual smoke     | `pnpm dev` and exercise the UI in a browser | Final verification task         |

Unit / integration / e2e test layers are explicitly **skipped** for this plan: the project has no such layers and the issue does not ask the implementer to introduce one. Every feature task below replaces the TDD "write a failing test" step with the equivalent automated check (`pnpm lint` + `pnpm exec tsc --noEmit`) plus, where the task changes visible UI, a manual reload of `http://localhost:3000` and an explicit assertion of the new behavior.

## Tasks

### Task 1 — Add `BulkSelectBar` component

**Create:** `app/components/BulkSelectBar.tsx`
**Modify:** none
**Test:** lint + typecheck (no behavior change yet — component is unused after this task)

1. Create `app/components/BulkSelectBar.tsx` with the full contents below. The file declares the component, its props, and exports it as a named export.

   ```tsx
   "use client";

   interface BulkSelectBarProps {
     bulkSelect: boolean;
     selectedCount: number;
     bulkDeleting: boolean;
     onToggleBulk: () => void;
     onDeleteSelected: () => void;
   }

   export function BulkSelectBar({
     bulkSelect,
     selectedCount,
     bulkDeleting,
     onToggleBulk,
     onDeleteSelected,
   }: BulkSelectBarProps) {
     if (!bulkSelect) {
       return (
         <button className="btn btn-ghost btn-sm" onClick={onToggleBulk}>
           Select
         </button>
       );
     }

     const deleteDisabled = selectedCount === 0 || bulkDeleting;

     return (
       <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
         <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
           {selectedCount} selected
         </span>
         <button
           className="btn btn-danger btn-sm"
           onClick={onDeleteSelected}
           disabled={deleteDisabled}
           style={
             deleteDisabled
               ? { opacity: 0.5, cursor: "not-allowed" }
               : undefined
           }
         >
           {bulkDeleting ? "Deleting…" : "Delete selected"}
         </button>
         <button className="btn btn-ghost btn-sm" onClick={onToggleBulk}>
           Cancel
         </button>
       </div>
     );
   }
   ```

2. Run `pnpm lint` and `pnpm exec tsc --noEmit`. Both must exit 0. The component is exported but not yet referenced; TypeScript will not flag the unused export.
3. Commit.

**Commit message:** `feat(tasks): add BulkSelectBar presentational component`

---

### Task 2 — Wire bulk-select state and handlers into `Home`

**Create:** none
**Modify:** `app/page.tsx`
**Test:** lint + typecheck

1. In `app/page.tsx`, add the import for the new component near the existing imports (immediately after the `MainLayout` import on line 6):

   ```tsx
   import { BulkSelectBar } from "./components/BulkSelectBar";
   ```

2. Inside `Home`, immediately after the existing `loading` state (line 47), add three new state hooks:

   ```tsx
   const [bulkSelect, setBulkSelect] = useState(false);
   const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
   const [bulkDeleting, setBulkDeleting] = useState(false);
   ```

3. Add three new handlers after the existing `cycleStatus` function (after line 128), before the `filtered` declaration:

   ```tsx
   function toggleBulkSelect() {
     setBulkSelect((prev) => {
       const next = !prev;
       if (!next) setSelectedIds(new Set());
       return next;
     });
   }

   function toggleSelectId(id: string) {
     setSelectedIds((prev) => {
       const next = new Set(prev);
       if (next.has(id)) next.delete(id);
       else next.add(id);
       return next;
     });
   }

   async function handleBulkDelete() {
     if (selectedIds.size === 0 || bulkDeleting) return;
     const ids = Array.from(selectedIds);
     setBulkDeleting(true);
     try {
       await Promise.all(ids.map((id) => db.deleteTask(id)));
       const idsSet = new Set(ids);
       setTasks((prev) => prev.filter((t) => !idsSet.has(t.id)));
       setSelectedIds(new Set());
     } catch (e) {
       console.error(e);
     } finally {
       setBulkDeleting(false);
     }
   }
   ```

4. Run `pnpm lint` and `pnpm exec tsc --noEmit`. Both must exit 0. The new state and handlers are declared but not yet referenced by the JSX; ESLint's `no-unused-vars` is configured for variables only and will not flag local React state setters that are written but not read here, but for safety the next task wires every one of them in. If lint flags any of these as unused, do not silence with `// eslint-disable` — instead, proceed to Task 3, which references them all, and re-run lint at the end of Task 3.
5. Commit.

**Commit message:** `feat(tasks): add bulk-select state and bulk-delete handler`

---

### Task 3 — Render `BulkSelectBar` in the task-list header

**Create:** none
**Modify:** `app/page.tsx`
**Test:** lint + typecheck + manual smoke (`pnpm dev`)

1. In `app/page.tsx`, find the existing task-list header (currently lines 279-281):

   ```tsx
   <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.875rem" }}>
     <h2>{filtered.length} {filtered.length === 1 ? "Task" : "Tasks"}</h2>
   </div>
   ```

   Replace it with:

   ```tsx
   <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.875rem" }}>
     <h2>{filtered.length} {filtered.length === 1 ? "Task" : "Tasks"}</h2>
     <BulkSelectBar
       bulkSelect={bulkSelect}
       selectedCount={selectedIds.size}
       bulkDeleting={bulkDeleting}
       onToggleBulk={toggleBulkSelect}
       onDeleteSelected={handleBulkDelete}
     />
   </div>
   ```

2. Run `pnpm lint` and `pnpm exec tsc --noEmit`. Both must exit 0.
3. Manual smoke: start `pnpm dev`, open `http://localhost:3000`, and verify:
   - A **Select** button appears in the task-list header (right side).
   - Clicking **Select** replaces it with `0 selected`, a disabled **Delete selected** button, and a **Cancel** button.
   - Clicking **Cancel** returns the header to the **Select** button.
4. Commit.

**Commit message:** `feat(tasks): render bulk-select toolbar above task list`

---

### Task 4 — Render per-card checkbox and hide single-task actions in bulk mode

**Create:** none
**Modify:** `app/page.tsx`
**Test:** lint + typecheck + manual smoke

1. In `app/page.tsx`, locate the task card's inner flex row (currently line 295):

   ```tsx
   <div style={{ display: "flex", alignItems: "flex-start", gap: "0.875rem" }}>
   ```

   As the **first child** of this `<div>`, before the existing status-toggle `<button>` (line 297), insert a conditional checkbox:

   ```tsx
   {bulkSelect && (
     <input
       type="checkbox"
       checked={selectedIds.has(task.id)}
       onChange={() => toggleSelectId(task.id)}
       aria-label={`Select task ${task.title}`}
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

2. Locate the per-card Edit/Delete actions block (currently lines 357-365):

   ```tsx
   {/* Actions — always visible */}
   <div style={{ display: "flex", gap: "0.375rem", flexShrink: 0 }}>
     <button className="btn btn-ghost btn-sm" onClick={() => handleEdit(task)}>
       Edit
     </button>
     <button className="btn btn-danger btn-sm" onClick={() => handleDelete(task.id)}>
       Delete
     </button>
   </div>
   ```

   Wrap the entire `<div>` (including the comment) in a `{!bulkSelect && ( ... )}` guard so the block is omitted while bulk-select is on:

   ```tsx
   {!bulkSelect && (
     <div style={{ display: "flex", gap: "0.375rem", flexShrink: 0 }}>
       <button className="btn btn-ghost btn-sm" onClick={() => handleEdit(task)}>
         Edit
       </button>
       <button className="btn btn-danger btn-sm" onClick={() => handleDelete(task.id)}>
         Delete
       </button>
     </div>
   )}
   ```

   Delete the now-stale `{/* Actions — always visible */}` comment on line 357.

3. Run `pnpm lint` and `pnpm exec tsc --noEmit`. Both must exit 0.
4. Manual smoke: with `pnpm dev` running, verify:
   - With at least one task present, click **Select** in the header.
   - A checkbox appears at the left of every task card. The status-toggle circle stays. The Edit/Delete buttons are hidden.
   - Click two checkboxes. The header reads `2 selected`. **Delete selected** is enabled.
   - Click **Delete selected**. Both checked tasks disappear from the list. `0 selected`, **Delete selected** is disabled again. The bulk mode remains active.
   - Click **Cancel**. Header returns to **Select**. Edit/Delete reappear on every card. No checkboxes remain.
   - Re-enter bulk mode: prior selections must not return (verifies the off-toggle reset).
5. Commit.

**Commit message:** `feat(tasks): bulk-select per-card checkbox and bulk delete wiring`

---

### Task 5 — Final verification

**Create:** none
**Modify:** none
**Test:** lint + typecheck + production build + manual smoke
**Exception:** non-feature task — no failing test step (project has no test suite, see Testing strategy).

1. Run, in order, and require each to exit 0:
   - `pnpm lint`
   - `pnpm exec tsc --noEmit`
   - `pnpm build`
2. Restart `pnpm dev`. In the browser at `http://localhost:3000`:
   - Create three tasks if none exist.
   - Verify single-task Edit and Delete still work when bulk-select is **off**.
   - Verify status-cycle (the circle button) still works when bulk-select is **off** and when it is **on**.
   - Verify the bulk-select flow from Task 4 step 4 once more end-to-end.
   - Verify the IndexedDB store actually shrank: open DevTools → Application → IndexedDB → `TodoApp` → `tasks` and confirm the deleted ids are gone (not just removed from React state).
3. No commit (this task only verifies).

**Commit message:** *(none — verification only)*

## Files changed at end of plan

- `app/page.tsx` — adds 3 state hooks, 3 handlers, 1 import, 1 toolbar render, 1 conditional checkbox, wraps existing action buttons in a `!bulkSelect` guard.
- `app/components/BulkSelectBar.tsx` — new file, presentational component.

No other files. No schema changes. No new dependencies.
