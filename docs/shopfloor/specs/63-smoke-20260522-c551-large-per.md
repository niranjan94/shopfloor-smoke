# Spec: Per-task subtasks with completion rollup

Issue: [#63](https://github.com/niranjan94/shopfloor-smoke/issues/63) — `smoke-20260522-c551/large: per-task subtasks with rollup`

## Problem

The tasks list in `app/page.tsx` currently treats each `Task` as an atomic unit. Users have no way to record the smaller pieces of work that make up a task. The issue asks for nested subtasks on every task card, persisted in IndexedDB alongside the parent task, with a rollup rule that ties the parent's `status` to whether its subtasks are complete.

The change spans three files (`app/types.ts`, `app/db.ts`, `app/page.tsx`) and introduces a v1→v2 IndexedDB migration that must backfill every existing row, plus cross-state logic that constrains the parent's `cycleStatus` transitions when subtasks exist.

## Goals

- Add a `subtasks` array to the `Task` interface.
- Migrate the on-disk schema to v2 and backfill `subtasks: []` on every existing task row.
- Render a subtask tree under each task card with add / toggle-done / delete affordances.
- Enforce the rollup rule: a parent can hold `status: "done"` only when every subtask is `done: true`; otherwise the parent is capped at `"in-progress"`.

## Non-goals

- Nesting subtasks more than one level deep. The tree is exactly two levels: task → subtask.
- Editing subtask titles after creation. Add and delete are sufficient for the smoke target.
- Subtask-level metadata (priority, due date, description, category). Subtasks carry only the fields needed for the rollup and minimal display.
- A separate IndexedDB object store for subtasks. They live inline on the parent row, which keeps the migration trivial and matches the issue's wording ("New `subtasks` array on the Task type").
- Filtering or searching by subtask content. Existing filters operate on the parent task only.
- Auto-promoting the parent to `"done"` when the last subtask is toggled complete. Status advancement remains an explicit user action via the existing status circle.

## Scope

Single subsystem (the tasks list and its storage). No decomposition needed.

## Design

### 1. `Subtask` type (`app/types.ts`)

Add a new exported interface and extend `Task`:

```ts
export interface Subtask {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
}

export interface Task {
  // …existing fields…
  subtasks: Subtask[];
}
```

`subtasks` is **required**, not optional. The migration guarantees every persisted row has the field, and `handleSave` initializes it to `[]` on new tasks. Making it required removes the need for `?? []` defensive reads scattered through `page.tsx`.

**Purpose:** model a single checklist item under a parent task.
**Dependencies:** none.

### 2. IndexedDB v2 migration (`app/db.ts`)

Bump `DB_VERSION` from `1` to `2`. Extend the existing `onupgradeneeded` handler so that, on any upgrade whose `event.oldVersion < 2`, a cursor walks every row in `TASKS_STORE` inside the upgrade transaction and writes back `{ ...row, subtasks: row.subtasks ?? [] }`.

Sketch (illustrative, not normative):

```ts
request.onupgradeneeded = (event) => {
  const db = (event.target as IDBOpenDBRequest).result;
  const tx = (event.target as IDBOpenDBRequest).transaction!;

  if (!db.objectStoreNames.contains(TASKS_STORE)) {
    const taskStore = db.createObjectStore(TASKS_STORE, { keyPath: "id" });
    taskStore.createIndex("category", "category", { unique: false });
    taskStore.createIndex("status", "status", { unique: false });
    taskStore.createIndex("priority", "priority", { unique: false });
    taskStore.createIndex("dueDate", "dueDate", { unique: false });
  }
  if (!db.objectStoreNames.contains(CATEGORIES_STORE)) {
    db.createObjectStore(CATEGORIES_STORE, { keyPath: "id" });
  }

  if (event.oldVersion < 2 && db.objectStoreNames.contains(TASKS_STORE)) {
    const store = tx.objectStore(TASKS_STORE);
    const cursorReq = store.openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor) return;
      const row = cursor.value as Partial<Task>;
      if (!Array.isArray(row.subtasks)) {
        cursor.update({ ...row, subtasks: [] });
      }
      cursor.continue();
    };
  }
};
```

Key points:

- Reuse the upgrade transaction (`event.target.transaction`) for the backfill so the schema change and the data write commit atomically.
- The fresh-install path (no existing `TASKS_STORE`) skips the backfill block because there is nothing to walk.
- The backfill is idempotent — `cursor.update` only runs when the field is missing — so a hypothetical future v2→v3 upgrade that re-enters this branch is safe.

No other `db.*` method changes shape: `addTask`, `updateTask`, `getTasks`, etc. already take a `Task`, and `Task` now includes `subtasks`.

**Purpose:** make every persisted row conform to the new `Task` shape before any read path sees it.
**Dependencies:** `Task`, `Subtask`.

### 3. Subtask UI and rollup (`app/page.tsx`)

#### 3a. Local state and helpers

Add a single small piece of input state at the top of `Home`:

```ts
const [subtaskDraft, setSubtaskDraft] = useState<Record<string, string>>({});
```

The map is keyed by parent task id so the draft input on each card stays local to that card without spinning up a child component's own state.

Add two pure helpers near the existing `statusLabel` / `priorityClass` block:

```ts
function allSubtasksDone(task: Task): boolean {
  return task.subtasks.length === 0 || task.subtasks.every((s) => s.done);
}

function rollupStatus(current: Task["status"], task: Task): Task["status"] {
  // Cap parent at "in-progress" while any subtask is incomplete.
  if (current === "done" && !allSubtasksDone(task)) return "in-progress";
  return current;
}
```

**Purpose / interface / dependencies:**

- `allSubtasksDone(task) → boolean`. Empty array counts as done so the existing UX for tasks without subtasks is unchanged. Depends on `Task`.
- `rollupStatus(current, task) → Task["status"]`. Single chokepoint that enforces the cap. Depends on `allSubtasksDone`.

#### 3b. Wire the rollup into existing flows

- **`handleSave` (new task):** initialize `subtasks: existing?.subtasks ?? []` so editing an existing task preserves its subtasks and new tasks start empty.
- **`cycleStatus`:** compute the next raw status with the existing rotation table, then pass it through `rollupStatus(nextRaw, task)` before persisting. Concretely: if `task.status === "in-progress"` and `!allSubtasksDone(task)`, the next status becomes `"todo"` (the natural rotation continues but skips `"done"`); `completedAt` is set only when the persisted status is `"done"`.
- **Subtask mutations:** after every add / toggle / delete, re-run `rollupStatus(task.status, updatedTask)` on the parent. The only case it changes anything is `done → in-progress` after a subtask is added or toggled back to incomplete, which matches the issue's "otherwise the parent is at most in-progress" requirement.

#### 3c. New subtask operations

Three handlers, all on `Home`, all using `db.updateTask` and mirroring the existing `cycleStatus` pattern (optimistic local update + persist):

```ts
async function addSubtask(parentId: string): Promise<void>
async function toggleSubtask(parentId: string, subtaskId: string): Promise<void>
async function deleteSubtask(parentId: string, subtaskId: string): Promise<void>
```

Contracts:

- `addSubtask` reads `subtaskDraft[parentId]`, trims it, no-ops on empty, appends `{ id: Date.now().toString(), title, done: false, createdAt: now }` to the parent's `subtasks`, applies `rollupStatus`, persists, updates `tasks` state, and clears `subtaskDraft[parentId]`.
- `toggleSubtask` flips `done` on the matching subtask, applies `rollupStatus`, persists, updates state.
- `deleteSubtask` removes the subtask by id, applies `rollupStatus` (length may drop to 0, which counts as "all done" and re-enables `"done"` for the parent), persists, updates state.

All three bump the parent's `updatedAt` and clear `completedAt` if the rollup demotes the parent off `"done"`.

#### 3d. Rendering

Inside the existing task-card `<div>` in the `filtered.map`, after the badges row and before the closing of the content `<div>`, render a `<SubtasksSection task={task} … />` JSX block. Keep it inline in `page.tsx` — no new file — to match the file's existing inline-component style.

The section contains:

1. **Progress label** when `task.subtasks.length > 0`: e.g. `"2 / 5 done"`. Hidden when there are no subtasks.
2. **List** of subtasks. Each row: a small circle button (reuses the existing status-circle visual idiom but binary on/off), the subtask title (line-through when `done`), and a ghost-styled delete button. Toggling the circle calls `toggleSubtask`; the delete button calls `deleteSubtask`.
3. **Add row**: a single `<input className="input">` bound to `subtaskDraft[task.id]` and an `Add` button calling `addSubtask(task.id)`. `Enter` on the input also submits.

The section is always rendered (no hide/show toggle) so the add row is reachable even when a task has no subtasks. This keeps the smoke target's UI predictable for screenshot/replay tests.

**Purpose:** present the subtask tree and its mutations.
**Dependencies:** `addSubtask`, `toggleSubtask`, `deleteSubtask`, `allSubtasksDone`, the existing `.input`, `.btn`, `.btn-ghost`, and `.btn-sm` styles already used elsewhere in the file.

#### 3e. Parent status-circle affordance

Update the parent status circle's `title` attribute (line `app/page.tsx:299`) so that when the rollup is capping the task, the tooltip reads e.g. `"Status: In Progress — finish subtasks to mark done"`. The click handler still calls `cycleStatus`; the cap is enforced inside that function, not by disabling the button. This keeps the smoke flow click-driven and observable.

## Trade-offs

- **Inline array vs. separate `subtasks` object store.** Picked inline because the issue spells out `subtasks` as a field on `Task` and because every read path already loads the full task row. A separate store would require a second `getAll` on every render and a manual join. Rejected: separate store keyed by `parentId` with a `parentId` index.
- **Required `subtasks: Subtask[]` vs. optional `subtasks?: Subtask[]`.** Picked required because the migration guarantees the field is present on every row that ever reaches the read path, and required typing removes scattered `?? []` reads. Rejected: optional, which would silently tolerate a partial migration but make every consumer defensive.
- **Inline JSX section vs. extracted `<SubtaskList />` component.** Picked inline to match `page.tsx`'s existing one-file style (the entire tasks UI lives in this file already). Rejected: a new `app/components/SubtaskList.tsx`; it would force prop-drilling of three handlers and the draft map without a real reuse win.
- **Enforce rollup in `cycleStatus` vs. in `db.updateTask`.** Picked `cycleStatus` (and the three subtask handlers) because the storage layer in `db.ts` is intentionally a thin IDB wrapper with no business logic. Rejected: rollup inside `db.updateTask`, which would couple persistence to UI semantics.
- **Auto-promote parent to `"done"` when last subtask completes vs. only cap.** Picked cap-only. The issue says the parent "may be marked done", not "must be". Auto-promotion would surprise users mid-checklist and is not asked for. Rejected: auto-promote on toggle.

## Testing strategy

`CLAUDE.md` is explicit: *"No tests: this is a smoke test target, not a tested app. There is no test suite."* `package.json` exposes only `dev`, `build`, `start`, and `lint` — no test runner is configured, and there is no `test/`, `tests/`, `spec/`, or `__tests__/` directory in the repo.

Layers and their applicability:

- **Unit / integration / e2e tests:** *not applicable.* Reason: project explicitly documents that no test suite exists and this app is a smoke-test target driven from outside, not a tested library. Adding a runner is out of scope for this issue.
- **Type check (`pnpm exec tsc`):** *applicable and required.* Must pass after the change. The required `subtasks` field on `Task` will surface any read path that has not been updated, including `handleSave`'s task construction.
- **Lint (`pnpm lint`):** *applicable and required.* Must pass after the change with no new warnings introduced in `app/types.ts`, `app/db.ts`, or `app/page.tsx`.
- **Production build (`pnpm build`):** *applicable and required.* Must succeed; this is the gate Next.js's smoke harness uses.
- **Manual smoke verification in `pnpm dev`:** *applicable and required.* The implementer must, in a browser:
  1. Load the app with an existing IndexedDB at v1 and confirm migration to v2 leaves every existing task visible with an empty subtask list (DevTools → Application → IndexedDB → `TodoApp` → `tasks`).
  2. Add, toggle, and delete subtasks under at least one task.
  3. Confirm that cycling a parent with an incomplete subtask goes `todo → in-progress → todo` (skipping `done`).
  4. Confirm that cycling a parent with no subtasks still goes `todo → in-progress → done → todo`.
  5. Confirm that toggling the last incomplete subtask back to incomplete on a parent in `done` demotes the parent to `in-progress` and clears `completedAt`.

## Open questions

None. The issue body, the triage rationale, and the existing code together resolve the design choices; trade-offs are recorded above with the rejected alternative for each.
