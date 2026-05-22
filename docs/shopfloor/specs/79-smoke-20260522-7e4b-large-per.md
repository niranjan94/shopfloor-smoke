# Per-task subtasks with completion rollup

Issue: niranjan94/shopfloor-smoke#79
Triage class: large

## Problem

Tasks on the home page (`app/page.tsx`) are flat: each task has a single status that cycles `todo → in-progress → done → todo`. The issue asks for nested subtasks on every task with add / toggle / delete, persisted alongside their parent in IndexedDB, and a completion rollup that prevents a parent from being marked `done` while any of its subtasks are still open.

The work touches four areas: the `Task` type, an IndexedDB v1→v2 migration with backfill, the task-card UI, and the existing `cycleStatus` flow that mutates parent status.

## Goals

- Persist a flat list of subtasks under each task in the same IndexedDB row.
- Backfill `subtasks: []` on every existing task row when the database opens at v2 for the first time, so code can assume the field exists.
- Render a nested subtask list inside each task card with: text input + add button, per-subtask done toggle, per-subtask delete button.
- Enforce the rollup constraint: a parent task's status is capped at `in-progress` whenever it has at least one subtask that is not `done`.

## Non-goals

- Subtasks of subtasks (nesting deeper than one level).
- Editing subtask text after creation.
- Reordering, drag-and-drop, or bulk actions on subtasks.
- Per-subtask metadata (priority, due date, category, description).
- Filtering, searching, or sorting the task list by subtask state.
- Auto-promoting the parent to `done` when the last subtask is toggled done. The constraint is permissive ("may be marked done"), not an auto-action; the user still clicks the parent status toggle.

## Scope

The issue is one cohesive feature: type + storage + UI + rollup logic must ship together to be coherent. No decomposition is proposed.

## Design

### Subtask shape (`app/types.ts`)

Add a new exported interface and a required field on `Task`:

```ts
export interface Subtask {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
}

export interface Task {
  // ...existing fields unchanged...
  subtasks: Subtask[]; // required; always an array, possibly empty
}
```

`subtasks` is non-optional. The migration guarantees the field exists on every row, and `handleSave` (new task creation) initializes it to `[]`. This avoids `?? []` sprinkled throughout the UI and rollup code.

### IndexedDB v2 migration (`app/db.ts`)

Bump `DB_VERSION` from `1` to `2`. Extend the existing `onupgradeneeded` handler so the v1→v2 step backfills `subtasks: []` on every existing row in the `tasks` store. The v0→v1 store-creation branch must still run for fresh browsers.

```ts
const DB_VERSION = 2;

// inside onupgradeneeded:
const oldVersion = event.oldVersion;
const tx = (event.target as IDBOpenDBRequest).transaction!;

if (oldVersion < 1) {
  // existing store + index creation, unchanged
}

if (oldVersion < 2) {
  const taskStore = tx.objectStore(TASKS_STORE);
  const cursorReq = taskStore.openCursor();
  cursorReq.onsuccess = () => {
    const cursor = cursorReq.result;
    if (!cursor) return;
    const row = cursor.value as Task & { subtasks?: Subtask[] };
    if (!Array.isArray(row.subtasks)) {
      cursor.update({ ...row, subtasks: [] });
    }
    cursor.continue();
  };
}
```

Notes:

- The cursor walk uses the version-change transaction provided on `event.target.transaction`; do not open a new transaction inside `onupgradeneeded`.
- The migration is idempotent (`Array.isArray` guard) so a partially-applied upgrade from a refreshed tab is safe.
- No new index is created. Subtasks are not queried independently; they live as a serialized array on the parent row.

The exported `db` object's method signatures (`addTask`, `updateTask`, `getTasks`, etc.) do not change. They already round-trip the full task object.

### Rollup helpers (new module `app/rollup.ts`)

A tiny pure-function module so the rules are testable and reused by both the status cycle and the subtask mutators.

```ts
import { Task } from "./types";

// True when the task either has no subtasks or every subtask is done.
export function allSubtasksDone(task: Task): boolean;

// Returns the status the parent would have *now*, given its current status
// and its subtasks. Used to clamp parent.status after a subtask mutation.
// Rules:
//   - If allSubtasksDone(task) is false and current is "done", return "in-progress".
//   - Otherwise return current unchanged.
export function clampParentStatus(task: Task): Task["status"];

// Returns the next status when the user clicks the parent's status toggle.
// Identical to today's cycle except: when current is "in-progress" and not
// allSubtasksDone(task), the next status is "todo" (skipping "done"). This
// keeps the click-always-does-something feel of the existing UI.
export function nextStatusForCycle(task: Task): Task["status"];
```

Dependencies: `Task` type only. No DB, no React.

### Task page integration (`app/page.tsx`)

#### Initial state on create

`handleSave` builds the new `Task` with `subtasks: []`. Edits preserve the existing `subtasks` array (the form does not expose subtask fields).

#### Status cycle

Replace the inline `next` map in `cycleStatus` with a call to `nextStatusForCycle(task)`. `completedAt` is set when the chosen next status is `"done"`; otherwise cleared. The user-visible effect: clicking the parent toggle on an `in-progress` task with open subtasks rolls back to `todo` instead of jumping to `done`.

#### Subtask mutators (new handlers on the `Home` component)

All three handlers update both IndexedDB (via `db.updateTask`) and local state. They operate on the parent `Task`, produce a new `Task` value with the mutated `subtasks` array and a clamped `status` (via `clampParentStatus`), then persist.

```ts
async function handleAddSubtask(parent: Task, title: string): Promise<void>;
//   title is trimmed; empty titles are ignored.
//   New Subtask: { id: Date.now().toString(), title, done: false, createdAt: now }.
//   Clamp parent status (a new not-done subtask can downgrade a "done" parent).

async function handleToggleSubtask(parent: Task, subtaskId: string): Promise<void>;
//   Flip `done` on the named subtask. Recompute clamped status.

async function handleDeleteSubtask(parent: Task, subtaskId: string): Promise<void>;
//   Remove by id. Recompute clamped status (deleting an open subtask may now
//   leave the parent with all-done subtasks; that does NOT auto-promote it).
```

Each handler:

1. Builds `nextSubtasks` from `parent.subtasks`.
2. Constructs `candidate: Task = { ...parent, subtasks: nextSubtasks, updatedAt: now }`.
3. Sets `updated.status = clampParentStatus(candidate)` and clears `completedAt` if status moved off `"done"`.
4. Calls `await db.updateTask(updated)` then `setTasks((prev) => prev.map(...))`.

A local component-scoped `subtaskDrafts: Record<string, string>` (task id → in-progress new-subtask text) backs the per-card input so each card has its own draft without lifting more state than necessary.

#### Subtask UI inside the task card

Inside the existing `.task-card` (just before the closing tag of the `Content` div around line 355), render a subtask block when `task.subtasks.length > 0` OR an "add subtask" input row that is always visible. Layout:

- A vertical list of `<div>` rows, one per subtask, each with:
  - A small round toggle button (smaller than the parent's, 16px), filled when `done`. Clicking calls `handleToggleSubtask`.
  - The title text. Line-through and muted color when `done` (mirroring how the parent title styles `done`).
  - A ghost-style "×" button on the right that calls `handleDeleteSubtask`.
- Below the list, one input row: a slim `input` for the new subtask title (bound to `subtaskDrafts[task.id]`) and a small "+ Add" button. Enter in the input also submits. On success the draft is cleared.
- A counter line above the list: "`N of M done`" (e.g. "2 of 5 done") when subtasks exist; hidden when zero.

All styling reuses existing CSS tokens (`btn`, `btn-ghost`, `btn-sm`, `badge`, `--text-muted`). No new global styles are introduced; inline styles consistent with the rest of `page.tsx` are acceptable.

#### Visual rollup signal

When a parent is `in-progress` AND `!allSubtasksDone(task)`, the parent's status toggle button shows the same `in-progress` styling as today; tooltip text changes to `"Status: In Progress — complete all subtasks to mark done"` so the user understands why clicking does not advance to `done`. This is the only place the UI calls out the constraint.

### Data invariants

After every persisted write (task create, task edit, status cycle, subtask add/toggle/delete) the following holds for every row:

1. `Array.isArray(task.subtasks)` is true.
2. If `task.status === "done"` then `allSubtasksDone(task)` is true.
3. Every `Subtask.id` is unique within its parent's `subtasks` array.

Invariant 2 is enforced by routing every status change through `clampParentStatus` (subtask mutators) or `nextStatusForCycle` (parent toggle). Invariant 3 is trivially upheld by `Date.now().toString()` because subtask creations are user-driven and serial within a card.

## Trade-offs

- **Embedded array vs. separate IndexedDB store for subtasks.** Chosen: embedded array on the `Task` row. Rejected: a sibling `subtasks` object store keyed by `(parentId, id)`. The embedded shape matches how the rest of the app already serializes nested data, makes the migration a single-pass cursor backfill, and keeps reads to one transaction. The separate-store approach would buy independent indexing (filter "tasks with any open subtask") which is not in scope.
- **Auto-promote parent on last subtask done.** Chosen: do not auto-promote. Rejected: auto-flip parent to `done` when the user toggles the last open subtask. The issue text says "may be marked done", which is permissive; auto-promotion would surprise a user who is just ticking off checklist items. Worst case the parent sits at `in-progress` until the user clicks the toggle once.
- **In-progress → done blocked vs. cycled to todo when subtasks open.** Chosen: cycle to `todo`. Rejected: leave at `in-progress` (the click does nothing). The existing `cycleStatus` UX is "every click moves you somewhere"; preserving that is less jarring than a silently-ignored click, and the tooltip explains the behavior.
- **Optional `subtasks?: Subtask[]` vs. required field.** Chosen: required. Rejected: optional with `?? []` at use sites. The migration guarantees the field, so optionality only buys forgiveness for code paths that should never happen; making it required pushes a clear invariant into the type system.

## Testing strategy

This project has no test suite (see `CLAUDE.md`: "No tests: this is a smoke test target"). The available verification layers are:

- **Type check (`pnpm exec tsc`).** Catches: every consumer of `Task` must now read or initialize `subtasks`; the new `Subtask` interface is consistent across `types.ts`, `db.ts`, `rollup.ts`, and `page.tsx`. Marking `subtasks` as required (not optional) makes this layer load-bearing — any code path that constructs a `Task` without `subtasks` fails compilation.
- **Lint (`pnpm lint`).** Catches: unused imports, React hook misuse, and the project's existing ESLint rules. Not behavior-aware.
- **Manual smoke in dev server (`pnpm dev`).** The only behavioral check. The implementer must walk through, in a single browser session with an existing v1 database (created by running `main` first):
  1. Open the app; existing tasks load and show "0 of 0 done" hidden / no subtask block.
  2. Add a subtask to an existing task; it persists across a hard refresh.
  3. Toggle a subtask done, then undone; status cap behavior matches the rules.
  4. Mark all subtasks done; click parent toggle from `in-progress` → `done` succeeds.
  5. With one subtask open and parent `in-progress`, click parent toggle; lands on `todo` (not `done`).
  6. Mark parent `done` (all subtasks done), then add a new not-done subtask; parent downgrades to `in-progress` and `completedAt` clears.
  7. Delete a subtask; counter and rollup update.
  8. Reload the browser; all state survives.

- **Unit / integration / e2e test layers**: not applicable. The project explicitly has no test suite and the smoke-target charter is to remain test-free so the parent `shopfloor` project can exercise the full pipeline end-to-end. Do not introduce a test runner as part of this work.

## Open questions

None. The spec resolves the migration shape, rollup semantics, and UI placement from the issue body and existing code; the triage rationale supplies no additional constraints.
