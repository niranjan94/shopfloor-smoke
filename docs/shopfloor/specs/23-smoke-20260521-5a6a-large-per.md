# Per-task subtasks with completion rollup

Issue: [#23](https://github.com/niranjan94/shopfloor-smoke/issues/23) — `smoke-20260521-5a6a/large: per-task subtasks with rollup`

## Problem

The tasks list at `app/page.tsx` tracks a single flat status per task. Users
need to break a task into smaller checklist items and have the parent task's
status reflect whether the work below it is complete. The store
(`app/db.ts`, IndexedDB `TodoApp`) currently has no place to persist subtasks,
so the change is full-stack within the client: type → schema migration →
data layer → page UI.

## Goals

- Add a `subtasks: Subtask[]` field to the `Task` shape so subtasks persist
  with their parent in a single record (no separate object store).
- Migrate existing `TodoApp` databases from v1 to v2, backfilling
  `subtasks: []` on every existing task row so the new field is never
  `undefined` at read time.
- Show a nested subtask tree inside each task card on the tasks page with
  add / toggle-done / delete affordances.
- Enforce a completion rollup: a parent task can only be advanced to
  `done` when either it has no subtasks or every subtask is `done`. When
  the rollup invariant is broken after the fact (a subtask is added or
  un-checked under a `done` parent), the parent is demoted to
  `in-progress` automatically.

## Non-goals

- Nested sub-subtasks. Subtasks are a single, flat level under a task.
- Per-subtask metadata beyond `id`, `title`, `done`, `createdAt` (no
  priority, category, due date, or description on subtasks).
- A separate `subtasks` IndexedDB object store, indexes on subtasks, or
  any query API that returns subtasks independently of their parent.
- Editing the title of an existing subtask. The supported edit
  operations are add, toggle-done, and delete.
- Reordering subtasks. They render in insertion order (array order as
  stored).
- Bulk operations (mark-all-done, clear-completed) on subtasks.

## Scope

This is a single-subsystem change scoped to the tasks page and its
storage layer. Three files are touched:

- `app/types.ts` — add the `Subtask` interface and the `subtasks` field
  on `Task`.
- `app/db.ts` — bump `DB_VERSION` to `2` and add a cursor-based backfill
  inside `onupgradeneeded`.
- `app/page.tsx` — render the `SubtaskList` component under each task
  card, wire up `addSubtask` / `toggleSubtask` / `deleteSubtask`, and
  extend `cycleStatus` with the rollup guard.

The dashboard, calendar, projects, and settings routes are stub pages
(see `CLAUDE.md`) and are intentionally untouched.

## Design

### Types — `app/types.ts`

Add a new interface and one required field on `Task`:

```ts
export interface Subtask {
  id: string;          // unique within the parent task; Date.now().toString() is sufficient for this smoke target
  title: string;       // trimmed, non-empty at write time
  done: boolean;
  createdAt: string;   // ISO-8601, set at creation, never mutated
}

export interface Task {
  // ...existing fields unchanged
  subtasks: Subtask[]; // required; always an array, never undefined
}
```

`subtasks` is **required, not optional**. The migration (below) is what
makes that safe for pre-existing rows. Downstream code (`page.tsx`) may
assume `task.subtasks` is always an array.

### Storage — `app/db.ts`

- Constant `DB_VERSION` becomes `2`.
- The existing `onupgradeneeded` block continues to create the `tasks`
  and `categories` stores on first install (the `if
  (!db.objectStoreNames.contains(...))` guards keep that idempotent).
- A new branch `if (event.oldVersion < 2) { ... }` runs the subtask
  backfill. It opens a cursor on the `tasks` store using the upgrade
  transaction (`event.target.transaction`, NOT a new transaction — the
  upgrade transaction is the only one allowed during
  `onupgradeneeded`), walks every row, and for any row whose
  `subtasks` is not an array, writes `subtasks: []` back via
  `cursor.update(row)`.

  ```ts
  if (event.oldVersion < 2) {
    const tx = (event.target as IDBOpenDBRequest).transaction!;
    const store = tx.objectStore(TASKS_STORE);
    const cursorReq = store.openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor) return;
      const row = cursor.value as Task & { subtasks?: Subtask[] };
      if (!Array.isArray(row.subtasks)) {
        row.subtasks = [];
        cursor.update(row);
      }
      cursor.continue();
    };
  }
  ```

- No new indexes, no new object stores, and no changes to the public
  `db` methods (`addTask`, `updateTask`, `deleteTask`, `getTasks`,
  `getTaskById`, `getTasksByCategory`, `addCategory`, `getCategories`).
  Subtasks ride along with their parent through `updateTask` / `getTasks`.

**Why backfill instead of a runtime default at read time:** writing the
field once at upgrade keeps the type honestly required throughout the
codebase, so `page.tsx` does not need to guard every access with
`task.subtasks ?? []`.

### Page — `app/page.tsx`

Five additions on top of the existing tasks page, no other changes to
filters / search / sort / form / stats:

1. **`allSubtasksDone(task: Task): boolean`** — module-level pure
   helper. Returns `task.subtasks.length > 0 && task.subtasks.every((s) => s.done)`.
   Used by both `cycleStatus` and the status-button `title` attribute.

2. **`SubtaskList` component** — local function component rendered
   inside each task card, below the badges row. Props:

   ```ts
   {
     task: Task;
     onAdd: (title: string) => void;
     onToggle: (subtaskId: string) => void;
     onDelete: (subtaskId: string) => void;
   }
   ```

   Behavior:
   - Renders each subtask as a row: a small circular toggle button
     (mirroring the parent's status button styling), the title (with
     strike-through and muted color when `done`), and a `Delete`
     button.
   - Maintains a local `draft` string state for the add-input. Submit
     fires on `Enter` key or on the `Add` button. Empty / whitespace-only
     drafts are dropped silently. After submit, the input clears.
   - Does not own any task state; all mutations go through the parent
     handlers passed in as props.

3. **`addSubtask(taskId, rawTitle)`** — finds the parent task in the
   `tasks` state, appends a new `Subtask` with a fresh `Date.now()`
   id, updates `updatedAt`, and demotes the parent from `done` to
   `in-progress` (clearing `completedAt`) because the new subtask is
   un-done and the rollup invariant would otherwise be broken.
   Persists via `db.updateTask` and updates local state.

4. **`toggleSubtask(taskId, subtaskId)`** — flips the `done` flag on
   the matching subtask. If the parent is currently `done` and the
   resulting subtask set is not fully done, demotes the parent to
   `in-progress` and clears `completedAt`. Persists via
   `db.updateTask`. Does **not** promote the parent to `done`
   automatically when the last subtask gets checked — promotion stays
   driven by the user clicking the parent's status button (see
   `cycleStatus`).

5. **`deleteSubtask(taskId, subtaskId)`** — removes the matching
   subtask. Demotion-to-`in-progress` fires only when the parent is
   `done` AND at least one subtask remains AND that remaining set is
   not fully done. (Deleting the last un-done subtask from a `done`
   parent does not demote — the parent is legitimately done because
   there is nothing un-done left below it. Deleting every subtask from
   a `done` parent also does not demote — a parent with zero subtasks
   is allowed to be `done`.) Persists via `db.updateTask`.

6. **`cycleStatus(task)` rollup guard** — the existing status cycle is
   `todo → in-progress → done → todo`. Replace the
   `in-progress → done` transition with the rollup-aware variant:

   ```ts
   if (current === "in-progress") {
     nextStatus =
       task.subtasks.length === 0 || allSubtasksDone(task)
         ? "done"
         : "todo"; // can't advance to done while subtasks remain; loop back to todo
   }
   ```

   The status-button `title` (tooltip) is extended to surface the
   blocked case: when the task is `in-progress` with un-done
   subtasks, the tooltip reads
   `"Status: In Progress — finish subtasks to mark done"`.

### Rollup invariant — single statement

After every mutation that touches `task.status` or `task.subtasks`, the
following must hold:

> If `task.status === "done"`, then either `task.subtasks.length === 0`
> or every subtask is `done`.

The handlers above each enforce this on the path that could break it.
No central validator is added; the invariant is small enough to keep
local to each mutation.

## Trade-offs

- **Embedded subtasks vs. separate object store.** Embedding subtasks in
  the parent record was chosen. It keeps the data layer one round-trip
  per mutation, removes the need for a `parentId` foreign key, and means
  the migration is a single in-place cursor walk. Rejected:
  a separate `subtasks` store with an index on `parentId`. That would
  buy us per-subtask queries and reordering, but the issue requires
  neither, and the smoke target's record sizes are tiny.
- **Auto-promote parent to `done` when the last subtask is checked.**
  Rejected. The parent's status remains user-driven; checking off
  subtasks only ever *demotes* a parent, never *promotes* it. This
  keeps the status button the single source of "I'm done with this
  task" intent and avoids surprising the user with state changes they
  did not initiate. The rollup is asymmetric on purpose.
- **`subtasks` required vs. optional on `Task`.** Required. Combined
  with the v2 backfill, this lets the rest of the code read
  `task.subtasks` without `?? []` guards. Optional would have avoided
  the migration but pushed defaulting into every reader.
- **Migration via cursor vs. lazy default on read.** Cursor-on-upgrade.
  See "Why backfill" note in `app/db.ts` above.

## Testing strategy

This project has no test framework (`package.json` has only `dev`,
`build`, `start`, `lint`; `CLAUDE.md` states "No tests: this is a smoke
test target, not a tested app. There is no test suite."). The
implement stage MUST NOT introduce a test framework as a side effect.

Layers that apply:

- **Type check** — `pnpm exec tsc`. Catches that `Task.subtasks` is
  threaded consistently (required field, never `undefined`) and that
  the `Subtask` interface is exported and consumed correctly in
  `page.tsx`.
- **Lint** — `pnpm lint`. Runs `eslint` with `eslint-config-next`.
  Catches unused imports / vars and React rule violations in
  `SubtaskList` and the new handlers.
- **Production build** — `pnpm build`. `next build` re-runs TypeScript
  and bundles; catches any client/server boundary slip (this page is
  `"use client"`, which must stay).
- **Manual smoke** — `pnpm dev` and exercise the page in a real
  browser, because the storage layer is IndexedDB and there is no
  headless harness for it in this repo. Manual checklist:
  1. Load the page with an existing v1 database (a profile that has
     tasks created before this change). Open DevTools → Application →
     IndexedDB → `TodoApp`. Confirm version is `2` and every task row
     has `subtasks: []`.
  2. Add a subtask under a task. It appears in the list and survives a
     page reload.
  3. Toggle a subtask done / not-done. The check mark and strike-through
     update; reload preserves state.
  4. Delete a subtask. It disappears; reload confirms.
  5. With a task in `in-progress` and at least one un-done subtask,
     click the parent's status button. The task does NOT advance to
     `done`; it cycles back to `todo`. The status-button tooltip reads
     "finish subtasks to mark done" while the parent was blocked.
  6. Check off every subtask, then click the parent's status button
     from `in-progress`. The parent advances to `done`.
  7. With a `done` parent that has subtasks, add a new subtask. The
     parent demotes to `in-progress` and `completedAt` is cleared.
  8. With a `done` parent whose subtasks are all done, un-check one.
     The parent demotes to `in-progress`.
  9. With a `done` parent that has subtasks, delete subtasks one by
     one. Deleting un-done subtasks behaves per spec; deleting until
     zero subtasks remain leaves the parent `done` (a parent with no
     subtasks is allowed to stay done).

Layers explicitly not applicable: unit tests, integration tests, e2e
tests, snapshot tests. The project has none of these and the issue does
not introduce one.

## Implementation note for downstream stages

A read of the working tree at spec time shows the three target files
already implement this design end to end:
`app/types.ts` already exports the `Subtask` interface and includes
`subtasks: Subtask[]` on `Task`; `app/db.ts` already declares
`DB_VERSION = 2` with the cursor-based backfill block; `app/page.tsx`
already contains `allSubtasksDone`, the `SubtaskList` component, the
three subtask handlers, and the rollup guard inside `cycleStatus`,
including the `title`-attribute tooltip variant. The implement stage
should diff against this spec, confirm the contract is satisfied, and
produce a no-op or minimal-correction patch rather than re-writing the
feature. Any divergence from the contract above must be reconciled in
favor of the spec.

## Open questions

None. All ambiguities (rollup symmetry, embedded vs. separate store,
required vs. optional field, migration strategy, no-auto-promote) are
resolved inline above and grounded in the existing working tree.
