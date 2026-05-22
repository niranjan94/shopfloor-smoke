# Plan — Bulk-select and delete tasks (#77)

Add a bulk-select mode to the tasks list (`app/page.tsx`). When the user toggles bulk-select on, each task card renders a checkbox; a "Delete selected" action removes every checked task via `db.deleteTask` and updates the local `tasks` state. Selection state is in-memory React state (no schema changes) and resets whenever bulk mode is toggled off.

This plan touches `app/page.tsx` and adds one small presentational component at `app/components/BulkSelectBar.tsx`. No other files are modified.

## Testing strategy

This project has no automated test suite (see `CLAUDE.md` → "No tests: this is a smoke test target"). The test layers available are:

- **Type checking** — `pnpm exec tsc --noEmit`. Run after every code change. Must report zero errors.
- **Lint** — `pnpm lint`. Run after every code change. Must report zero errors (warnings tolerated only if they already exist on `main` for unrelated code).
- **Manual browser smoke** — `pnpm dev`, open `http://localhost:3000`, exercise the golden path and edge cases described in Task 4. Cannot be automated.

Unit/integration/e2e test layers are **not** available in this repo and MUST NOT be introduced. Every feature task below verifies via `tsc` + `lint` after the production change, and Task 4 covers the manual browser smoke pass for the whole feature.

## State and UX decisions (binding for all tasks)

These are the design decisions the implementation agent MUST follow. They were derived from the issue body and triage comment.

1. **Two new state hooks in `Home` (`app/page.tsx`):**
   - `const [bulkMode, setBulkMode] = useState(false);`
   - `const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());`
2. **Toggle button placement.** Add a single button in the existing task-list header row at `app/page.tsx:279` (the `<div>` that wraps `<h2>{filtered.length} {...}</h2>`). The button sits to the right of the `<h2>` (justify-content space-between already in place). Label: `"Select"` when `bulkMode === false`; `"Cancel"` when `bulkMode === true`. Class: `btn btn-ghost btn-sm`.
3. **Toggling off resets selection.** The toggle handler is `() => { setBulkMode((b) => { if (b) setSelectedIds(new Set()); return !b; }); }`. Equivalently, an explicit handler `toggleBulkMode` may be defined.
4. **Per-card checkbox.** When `bulkMode === true`, render a native `<input type="checkbox">` as the FIRST child inside the task card's flex row (`app/page.tsx:295`), BEFORE the existing status-cycle button. When `bulkMode === false`, render nothing in that slot (no placeholder). The checkbox's `checked` is `selectedIds.has(task.id)`; its `onChange` calls a handler `toggleSelected(task.id)` that immutably adds or removes the id from `selectedIds`. The status-cycle button continues to work unchanged in bulk mode (clicking it cycles status, not selection).
5. **Bulk action bar.** When `bulkMode === true`, render a `<BulkSelectBar>` component immediately ABOVE the task list grid (i.e. between the `<h2>` header row at `app/page.tsx:279-281` and the empty-state / list block at `app/page.tsx:283`). It is hidden entirely when `bulkMode === false`. Props: `{ selectedCount: number; onDeleteSelected: () => void; onSelectAll: () => void; onClearSelection: () => void; allVisibleSelected: boolean; }`.
6. **Bulk-delete handler.** Defined in `Home` as `async function handleBulkDelete()`:
   - Snapshot `const ids = Array.from(selectedIds);`.
   - If `ids.length === 0`, return early.
   - For each id, `await db.deleteTask(id);` inside a `try/catch` that logs to `console.error` on failure (same pattern as the existing `handleDelete` at `app/page.tsx:95-100`). Deletions are sequential, not `Promise.all`, to mirror existing single-delete style and keep error attribution simple.
   - After the loop, `setTasks((prev) => prev.filter((t) => !selectedIds.has(t.id)));` and `setSelectedIds(new Set());`. Leave `bulkMode` unchanged (user explicitly exits via the toggle).
7. **Select-all / clear-all semantics.** "Select all" selects every task currently in `filtered` (the filtered + sorted list the user is looking at), NOT the full `tasks` array. "Clear selection" empties `selectedIds`. `allVisibleSelected` is `filtered.length > 0 && filtered.every((t) => selectedIds.has(t.id))`.
8. **Per-card Edit/Delete buttons remain visible and functional in bulk mode.** Do not hide them; the user can still single-delete or edit during bulk-select. This matches the issue's "UI + client-side selection state only" scope (no behavior is removed).
9. **No styling framework changes.** Use the inline-style + existing class (`btn`, `btn-ghost`, `btn-sm`, `btn-danger`, `glass`) idioms already in `app/page.tsx`. No new CSS files, no Tailwind utility classes beyond what already appears in `app/components/MainLayout.tsx`.
10. **No new types or `app/types.ts` changes.** `selectedIds: Set<string>` is fully local.

## Task list

### Task 1 — Add `BulkSelectBar` component

**Affected files:**

- Create: `app/components/BulkSelectBar.tsx`

**Exception:** Non-feature task (pure presentational component with no behavior of its own; behavior is verified end-to-end in Task 3 and Task 4). Skip TDD steps 1–4. Verify via `tsc` and `lint`.

**Implementation.** Create `app/components/BulkSelectBar.tsx` with this exact content:

```tsx
"use client";

export interface BulkSelectBarProps {
  selectedCount: number;
  allVisibleSelected: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onDeleteSelected: () => void;
}

export function BulkSelectBar({
  selectedCount,
  allVisibleSelected,
  onSelectAll,
  onClearSelection,
  onDeleteSelected,
}: BulkSelectBarProps) {
  return (
    <div
      className="glass"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.75rem 1rem",
        marginBottom: "0.875rem",
        gap: "0.75rem",
      }}
    >
      <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
        {selectedCount} selected
      </div>
      <div style={{ display: "flex", gap: "0.375rem" }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={allVisibleSelected ? onClearSelection : onSelectAll}
        >
          {allVisibleSelected ? "Clear selection" : "Select all"}
        </button>
        <button
          className="btn btn-danger btn-sm"
          onClick={onDeleteSelected}
          disabled={selectedCount === 0}
        >
          Delete selected
        </button>
      </div>
    </div>
  );
}
```

**Verification:**

1. Run `pnpm exec tsc --noEmit`. Expect zero errors.
2. Run `pnpm lint`. Expect zero new errors and zero new warnings introduced by this file.

**Commit message:** `feat(tasks): add BulkSelectBar component`

---

### Task 2 — Add bulk-mode state and handlers to `Home`

**Affected files:**

- Modify: `app/page.tsx`

**Exception:** Non-feature task in isolation — this task only adds state declarations and handler functions; nothing in the rendered DOM changes yet (handlers are not yet wired to JSX). Skip TDD steps 1–4. Verify via `tsc` and `lint`. The behavior these handlers enable is tested end-to-end in Task 4.

**Implementation.** In `app/page.tsx`:

1. At the top of the file, add the `BulkSelectBar` import next to the existing `MainLayout` import:

   ```tsx
   import { BulkSelectBar } from "./components/BulkSelectBar";
   ```

2. Inside the `Home` component, immediately after the existing `const [loading, setLoading] = useState(true);` (currently `app/page.tsx:47`), add:

   ```tsx
   const [bulkMode, setBulkMode] = useState(false);
   const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
   ```

3. After the existing `handleDelete` function (currently ends at `app/page.tsx:100`), add these handlers (verbatim — do NOT abbreviate):

   ```tsx
   function toggleBulkMode() {
     setBulkMode((b) => {
       if (b) setSelectedIds(new Set());
       return !b;
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

   function selectAllVisible() {
     setSelectedIds(new Set(filtered.map((t) => t.id)));
   }

   function clearSelection() {
     setSelectedIds(new Set());
   }

   async function handleBulkDelete() {
     const ids = Array.from(selectedIds);
     if (ids.length === 0) return;
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

   **Note on hoisting.** `selectAllVisible` references `filtered`, which is declared later in the component (currently `app/page.tsx:130`). Because `filtered` is a `const` initialized at render time, and `selectAllVisible` is only invoked from event handlers (after render), the standard closure-over-render-scope pattern works exactly as in the existing `cycleStatus` / `handleSave` handlers — no reordering of `filtered` is needed. If `tsc` complains about use-before-declaration (it should not, since the reference is inside a function body), move the `selectAllVisible` definition to immediately after the `filtered` declaration; leave the other four handlers where they are.

   The const `allVisibleSelected` is NOT computed here; it is computed inline in the JSX in Task 3 so it stays adjacent to its consumer.

**Verification:**

1. Run `pnpm exec tsc --noEmit`. Expect zero errors.
2. Run `pnpm lint`. The handlers are currently unused (they will be wired in Task 3); if ESLint flags any of them as `no-unused-vars`, that is expected to be resolved in Task 3 and is acceptable for this intermediate commit. If lint fails the build (i.e. the repo treats warnings as errors), instead split Task 2 and Task 3 into a single commit by performing both before running lint — but commit them separately with the messages below.

**Commit message:** `feat(tasks): add bulk-select state and handlers`

---

### Task 3 — Wire bulk-mode UI into the task list

**Affected files:**

- Modify: `app/page.tsx`

This is the feature task that changes user-visible behavior.

**TDD shape.** The project has no unit/integration/e2e test layer, so steps 1, 2, and 4 of the canonical TDD shape are not applicable. The available verification at this layer is `tsc` + `lint` + manual browser smoke (Task 4). Follow this adapted shape:

1. (N/A — no automated test layer.)
2. (N/A — no automated test layer.)
3. Make the production change described below.
4. Run `pnpm exec tsc --noEmit` and `pnpm lint`. Both must pass.
5. Commit using the message at the bottom of this task.

Manual browser verification of the resulting behavior is the dedicated Task 4 below.

**Implementation.** All edits are in `app/page.tsx`. Make each edit exactly:

**3a — Toggle button in the task-list header row.** Replace the header `<div>` currently at `app/page.tsx:279-281`:

```tsx
<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.875rem" }}>
  <h2>{filtered.length} {filtered.length === 1 ? "Task" : "Tasks"}</h2>
</div>
```

with:

```tsx
<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.875rem" }}>
  <h2>{filtered.length} {filtered.length === 1 ? "Task" : "Tasks"}</h2>
  <button className="btn btn-ghost btn-sm" onClick={toggleBulkMode}>
    {bulkMode ? "Cancel" : "Select"}
  </button>
</div>
```

**3b — Render the bulk action bar above the list/empty-state.** Immediately AFTER the closing `</div>` of the header row above, and BEFORE the `{filtered.length === 0 ? (` ternary (currently `app/page.tsx:283`), insert:

```tsx
{bulkMode && (
  <BulkSelectBar
    selectedCount={selectedIds.size}
    allVisibleSelected={filtered.length > 0 && filtered.every((t) => selectedIds.has(t.id))}
    onSelectAll={selectAllVisible}
    onClearSelection={clearSelection}
    onDeleteSelected={handleBulkDelete}
  />
)}
```

**3c — Render the per-card checkbox.** Inside the task-card flex row (`app/page.tsx:295` — the `<div style={{ display: "flex", alignItems: "flex-start", gap: "0.875rem" }}>`), as the FIRST child (immediately before the existing `{/* Status toggle */}` button at `app/page.tsx:296-319`), insert:

```tsx
{bulkMode && (
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

Do NOT modify the existing status-cycle button, content block, or actions block — they remain in place and functional.

**3d — No other JSX or handler changes.** Specifically: do not hide the per-card Edit/Delete buttons in bulk mode; do not disable the status-cycle button in bulk mode; do not modify the filtered/sort logic.

**Verification:**

1. Run `pnpm exec tsc --noEmit`. Expect zero errors.
2. Run `pnpm lint`. Expect zero new errors and zero new warnings.

**Commit message:** `feat(tasks): wire bulk-select UI and bulk delete`

---

### Task 4 — Manual browser smoke pass

**Affected files:** none (verification-only task).

**Exception:** Verification-only task. No TDD shape applies; no commit is produced by this task.

**Procedure.** Start the dev server with `pnpm dev` and open `http://localhost:3000`. Seed the database with at least 4 tasks of varying status / category / priority via the existing "New Task" form (or reuse existing IndexedDB state). Then walk through every check below. Each step must pass; if any fails, return to the relevant code task, fix the issue, and re-run the full checklist.

**Golden path:**

1. With bulk mode OFF, confirm the task list looks identical to `main` — no checkboxes visible, the header row shows the task count and a `Select` button on the right.
2. Click `Select`. The button label changes to `Cancel`. The `BulkSelectBar` appears between the header and the task list, showing `0 selected`, a `Select all` button, and a `Delete selected` button (disabled).
3. Each task card now shows a checkbox at the far left of its row, before the status-cycle circle.
4. Check three of the task cards. The bar shows `3 selected`. `Delete selected` becomes enabled.
5. Click `Delete selected`. The three tasks are removed from the visible list immediately. The bar shows `0 selected` and `Delete selected` is disabled again. Bulk mode remains ON.
6. Reload the page. The deleted tasks are gone (confirms IndexedDB persistence via `db.deleteTask`).
7. Click `Cancel`. The bulk bar disappears, the checkboxes disappear from each card, and the header button returns to `Select`.

**Edge cases:**

8. Enter bulk mode, check 2 tasks, then click `Cancel` without deleting. Re-enter bulk mode — no checkboxes are pre-checked (selection resets on toggle-off). ✅ Decision §3.
9. Enter bulk mode, click `Select all`. Every visible card is checked; the button label flips to `Clear selection`. Click `Clear selection`; everything unchecks; label flips back. ✅ Decision §7.
10. Apply a status or category filter that hides some tasks, then enter bulk mode and click `Select all`. Only the visible (filtered) tasks are selected. Clear the filter — previously hidden tasks reappear UNchecked. ✅ Decision §7.
11. In bulk mode with one task selected, click the per-card status-cycle circle on a DIFFERENT task. Status advances normally; selection state is unaffected. ✅ Decision §4 & §8.
12. In bulk mode with one task selected, click the per-card `Delete` button on a DIFFERENT task. That single task is deleted; the originally selected task remains in `selectedIds` and stays visually checked. ✅ Decision §8.
13. In bulk mode, click `Delete selected` with zero selected (button should be disabled and a no-op). No state changes; no errors in the console.
14. With 0 tasks in the DB, the empty-state copy still renders correctly when bulk mode is toggled on (bar shows `0 selected`, `Select all` is harmless since `filtered` is empty).
15. Open the browser console during all steps above. There must be no React warnings (key warnings, hydration warnings) and no thrown errors from `db.deleteTask`.

**Verification artifact.** Report the manual-smoke result in the PR description: a short list confirming each numbered step passed, or describing any deviation and how it was resolved.

---

## Out of scope

The following are explicitly out of scope per the issue ("UI + client-side selection state only. No schema changes, no new persistence fields."):

- Persisting `selectedIds` to IndexedDB.
- Multi-tab selection sync.
- Keyboard shortcuts (e.g. Shift-click range select).
- Undo / soft-delete.
- Confirmation dialog before bulk delete (the existing single-delete also has no confirmation; we match that).
- Changes to `app/types.ts`, `app/db.ts`, or any stub page (`dashboard/`, `calendar/`, `projects/`, `settings/`).

If a future issue requests any of the above, it should be filed separately; this plan does not stub or preview them.

## Self-review

- **Completeness:** Testing strategy is present (derived from `CLAUDE.md`'s "No tests" note). Every task lists affected files, exact code to write, exact commands, and a Conventional Commits message. No `TBD`, no placeholders. ✅
- **Issue alignment:** Issue requires (a) bulk-select toggle, (b) per-card checkboxes when on, (c) "Delete selected" button that calls `db.deleteTask` and updates state, (d) scope ≤ `app/page.tsx` + ≤ 1 new component, (e) selection resets on toggle-off, (f) no schema changes. Tasks 1–3 implement (a)–(c); decisions §2 and §10 and the file-scope of each task enforce (d); decision §3 and Task 4 step 8 enforce (e); decisions §1 and §10 enforce (f). ✅
- **Task decomposition:** Task 1 = new component file only. Task 2 = state + handlers in one file. Task 3 = JSX wiring in same file. Task 4 = manual verification. Each is independently executable. ✅
- **Buildability:** Every type, prop, signature, file path, and class name is spelled out. The implementer can execute each task without re-reading the issue. ✅
- **Red flags:** No `should`/`probably`/`as appropriate` directing behavior. No deferred work without a named follow-up section (Out of Scope above). Type/prop names (`BulkSelectBarProps`, `selectedIds`, `bulkMode`, etc.) are spelled identically across tasks. Each task's verification (`tsc` + `lint`, plus Task 4 manual) maps to a layer named in the testing strategy. ✅
