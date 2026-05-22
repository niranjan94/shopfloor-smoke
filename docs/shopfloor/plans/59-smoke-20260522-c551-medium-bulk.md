# Implementation plan — #59 bulk-select and delete tasks

Add a bulk-select mode to the tasks list at `app/page.tsx`. When enabled, each
task card shows a checkbox, and a "Delete selected" action removes every checked
task via `db.deleteTask` and updates the local React `tasks` state. Selection
state is local React state and resets when bulk-select is toggled off.

Scope per the issue: UI + client-side selection state only. No schema changes,
no new persistence fields. Touch `app/page.tsx` and add exactly one new
component file `app/components/BulkSelectBar.tsx`.

## Testing strategy

This project has no automated test suite. From `CLAUDE.md`:

> **No tests**: this is a smoke test target, not a tested app. There is no test
> suite.

The project's existing verification surface is the following package scripts in
`package.json`:

| Layer            | Directory / scope    | Command         | Applies here? |
| ---------------- | -------------------- | --------------- | ------------- |
| Type check       | whole repo           | `pnpm exec tsc` | yes           |
| Lint             | whole repo           | `pnpm lint`     | yes           |
| Production build | whole repo           | `pnpm build`    | yes           |
| Manual smoke     | dev server (port 3000) | `pnpm dev`      | yes           |
| Unit tests       | n/a                  | n/a             | **skipped — project has no test suite (see CLAUDE.md)** |
| Integration tests | n/a                 | n/a             | **skipped — project has no test suite (see CLAUDE.md)** |
| E2E tests        | n/a                  | n/a             | **skipped — project has no test suite (see CLAUDE.md)** |

Because no automated test layer exists in this project for production-behavior
changes, feature tasks below skip the TDD steps 1–4 (write failing test → run →
implement → re-run). The exception applies: **the project has no test suite**.
Each feature task instead lists a deterministic manual verification step
(`pnpm exec tsc`, `pnpm lint`, `pnpm build`, plus an explicit `pnpm dev`
walk-through) that must pass before the commit.

## Data shapes used in this plan

The plan refers to these types from `app/types.ts` (already exist, no change):

```ts
export interface Task {
  id: string;
  title: string;
  description?: string;
  category: string;
  priority: "low" | "medium" | "high";
  status: "todo" | "in-progress" | "done";
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}
```

`db.deleteTask(id: string): Promise<void>` from `app/db.ts` (already exists, no
change).

## Design decisions

1. **Selection state shape**: `selectedIds: Set<string>` stored with
   `useState<Set<string>>(new Set())`. We use a `Set` (not an array) so
   add/remove/has are O(1) and the toggle handler stays simple. State changes
   produce a fresh `Set` each time so React detects the change.
2. **Bulk-mode flag**: `bulkMode: boolean`, `useState(false)`. Default off so
   the existing single-task delete UX is unchanged at first load.
3. **Reset rule**: toggling `bulkMode` from `true` to `false` resets
   `selectedIds` to `new Set()` (issue requirement). Toggling `false → true`
   also starts from an empty selection.
4. **Component split**: extract the controls bar (toggle button + selection
   count + "Delete selected" button) into a new component
   `app/components/BulkSelectBar.tsx`. The checkbox itself is rendered inline
   inside the existing `filtered.map((task, idx) => …)` block in `page.tsx`
   because it sits inside the task card layout; extracting the per-card
   checkbox would require also extracting the card, which exceeds the
   "at most one new component" cap.
5. **Bulk delete semantics**: call `db.deleteTask` for every id in
   `selectedIds` using `Promise.all`. After awaiting, update `tasks` with
   `prev.filter((t) => !selectedIds.has(t.id))`, clear `selectedIds`, and
   leave `bulkMode` enabled so the user can continue selecting. Errors are
   logged with `console.error` matching the existing pattern in
   `handleDelete` / `handleSave`.
6. **No keyboard shortcut, no "select all", no confirm dialog**: the issue
   does not ask for any of these. Out of scope.
7. **Existing single-task Edit/Delete buttons stay visible** in bulk mode.
   The issue does not require hiding them, and hiding would be a larger UX
   change than the issue scope allows.
8. **Styling**: reuse existing `btn`, `btn-primary`, `btn-danger`, `btn-muted`,
   and `btn-ghost` classes from the project's CSS. Do not introduce new CSS.

## Tasks

### Task 1 — Create `app/components/BulkSelectBar.tsx`

**Files**
- Create: `app/components/BulkSelectBar.tsx`
- Modify: (none)
- Test: (none — no test layer in this project; manual + tsc/lint/build only)

**Exception**: project has no test suite (see Testing strategy). TDD steps 1–4
are skipped.

**Implementation**

Create a client component that renders the bulk-select controls. The full file
contents must be:

```tsx
"use client";

interface BulkSelectBarProps {
  bulkMode: boolean;
  selectedCount: number;
  onToggleMode: () => void;
  onDeleteSelected: () => void;
}

export function BulkSelectBar({
  bulkMode,
  selectedCount,
  onToggleMode,
  onDeleteSelected,
}: BulkSelectBarProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      {bulkMode && (
        <>
          <span style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
            {selectedCount} selected
          </span>
          <button
            className="btn btn-danger btn-sm"
            onClick={onDeleteSelected}
            disabled={selectedCount === 0}
          >
            Delete selected
          </button>
        </>
      )}
      <button
        className={bulkMode ? "btn btn-muted btn-sm" : "btn btn-ghost btn-sm"}
        onClick={onToggleMode}
      >
        {bulkMode ? "Cancel" : "Select"}
      </button>
    </div>
  );
}
```

**Verify**
1. Run `pnpm exec tsc` from the repo root — must exit 0.
2. Run `pnpm lint` from the repo root — must exit 0. (The component is unused
   at this point; that is acceptable in this intermediate state because Next.js
   / the project's eslint config does not error on unused exports.)
3. Confirm no other files were touched: `git status --short` should list only
   `app/components/BulkSelectBar.tsx`.

**Commit**: `feat(bulk-select): add BulkSelectBar component`

---

### Task 2 — Wire bulk-select state and rendering in `app/page.tsx`

**Files**
- Create: (none)
- Modify: `app/page.tsx`
- Test: (none — no test layer in this project)

**Exception**: project has no test suite. TDD steps 1–4 are skipped.

**Implementation**

Make exactly the changes below to `app/page.tsx`. The line numbers refer to the
current file (the version at the head of `main` whose `tasks` state starts
empty and whose existing `handleDelete` lives near line 95).

**2a. Imports.** After the existing line `import { MainLayout } from "./components/MainLayout";` add:

```ts
import { BulkSelectBar } from "./components/BulkSelectBar";
```

**2b. State.** Inside `export default function Home()` immediately after the
existing `const [loading, setLoading] = useState(true);` line, add:

```ts
const [bulkMode, setBulkMode] = useState(false);
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
```

**2c. Handlers.** Immediately after the existing `handleDelete` function add
these three functions:

```ts
function toggleBulkMode() {
  setBulkMode((prev) => {
    if (prev) setSelectedIds(new Set());
    else setSelectedIds(new Set());
    return !prev;
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

**2d. Controls bar in the task-list header.** Replace the block currently at
lines ~278–281:

```tsx
<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.875rem" }}>
  <h2>{filtered.length} {filtered.length === 1 ? "Task" : "Tasks"}</h2>
</div>
```

with:

```tsx
<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.875rem" }}>
  <h2>{filtered.length} {filtered.length === 1 ? "Task" : "Tasks"}</h2>
  <BulkSelectBar
    bulkMode={bulkMode}
    selectedCount={selectedIds.size}
    onToggleMode={toggleBulkMode}
    onDeleteSelected={handleBulkDelete}
  />
</div>
```

**2e. Per-card checkbox.** Inside the existing `filtered.map((task, idx) => …)`
block, locate the inner row:

```tsx
<div style={{ display: "flex", alignItems: "flex-start", gap: "0.875rem" }}>
  {/* Status toggle */}
  <button
    onClick={() => cycleStatus(task)}
    …
```

Immediately inside that flex row, **before** the existing `{/* Status toggle */}`
button, insert:

```tsx
{bulkMode && (
  <input
    type="checkbox"
    checked={selectedIds.has(task.id)}
    onChange={() => toggleSelected(task.id)}
    style={{ flexShrink: 0, marginTop: "4px", width: 18, height: 18, cursor: "pointer" }}
    aria-label={`Select ${task.title}`}
  />
)}
```

No other JSX in the card changes. The existing single-task Edit and Delete
buttons remain visible.

**Verify**
1. Run `pnpm exec tsc` — must exit 0.
2. Run `pnpm lint` — must exit 0.
3. Run `pnpm build` — must exit 0.
4. Manual smoke via `pnpm dev` (open `http://localhost:3000`):
   a. With at least 2 tasks in the list, click **Select**. The button label
      becomes **Cancel**, "0 selected" appears, "Delete selected" appears
      disabled, and a checkbox appears at the left of every task card.
   b. Check two task checkboxes. The count reads "2 selected" and "Delete
      selected" becomes enabled.
   c. Click **Delete selected**. Both checked tasks vanish from the list, the
      count returns to "0 selected", and the remaining tasks are unaffected.
   d. Reload the page (`Cmd-R`). The deleted tasks are still gone (persistence
      via `db.deleteTask` confirmed).
   e. Click **Select** to enter bulk mode again, check one task, then click
      **Cancel**. Checkboxes disappear and the controls collapse back to a
      single **Select** button.
   f. Click **Select** again — the previous selection has been cleared (count
      is "0 selected").
5. Confirm only `app/page.tsx` was modified in this task:
   `git diff --name-only` should list only `app/page.tsx`.

**Commit**: `feat(bulk-select): add bulk-select mode and bulk delete to task list`

---

### Task 3 — Final verification pass

**Files**
- Create: (none)
- Modify: (none)
- Test: (none — verification-only task)

**Exception**: verification-only task; no production behavior change, no TDD
needed.

**Implementation**

Run the project's full verification surface once more from a clean state to
confirm nothing regressed:

1. `pnpm install` — should be a no-op if the lockfile is already satisfied.
2. `pnpm exec tsc` — must exit 0.
3. `pnpm lint` — must exit 0.
4. `pnpm build` — must exit 0.

If any of the four commands exits non-zero, return to Task 1 or Task 2,
diagnose, and fix the underlying issue. Do **not** add new dependencies; do
**not** disable lint rules; do **not** add `// @ts-expect-error` or `// eslint-disable`
comments to silence failures.

**Verify**

All four commands above exit 0.

**Commit**: this task produces no diff. If `git status --short` shows any
modified file after running the four commands (for example a regenerated
lockfile), stop and investigate — do not commit those changes blindly. If
there is no diff, **do not create an empty commit**; the task simply ends
without a commit.

## Out of scope (explicit non-goals for this PR)

- "Select all" / "Select none" shortcuts.
- Confirmation dialog before bulk delete.
- Keyboard shortcuts for bulk-select.
- Persisting selection across reloads.
- Touching `app/db.ts`, `app/types.ts`, or any of the stub pages
  (`dashboard`, `calendar`, `projects`, `settings`).
- Adding a test suite or test tooling — `CLAUDE.md` declares this project
  intentionally untested.
