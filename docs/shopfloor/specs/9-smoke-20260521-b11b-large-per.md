# Spec: per-task subtasks with rollup

Issue: [#9](https://github.com/niranjan94/shopfloor-smoke/issues/9) — smoke-20260521-b11b/large

## Problem

The tasks list in `app/page.tsx` treats every task as a flat unit. The issue requires that each task hold an ordered list of subtasks, that the IndexedDB store be migrated so existing rows continue to load, that the UI expose add/toggle/delete inline under each task card, and that the parent task's status be gated on subtask completion (a "rollup" rule). The rollup rule is the only behavioral invariant the issue introduces beyond storage and rendering.

## Goals

- Extend the data model with a `Subtask` type and a `subtasks: Subtask[]` field on `Task`.
- Migrate the `TodoApp` IndexedDB store from v1 to v2, backfilling `subtasks: []` on every existing row during the upgrade.
- Render a nested subtask tree under each task card on the home page with controls to add, toggle (todo ↔ done), and delete a subtask.
- Enforce the rollup rule: a parent task may move to `done` only when it has at least one subtask and all subtasks are `done`; otherwise the parent is capped at `in-progress`. Tasks with zero subtasks keep their existing three-state cycle unchanged.

## Non-goals

- Editing a subtask's title after creation. (Delete + re-add covers the case.)
- Reordering, drag-and-drop, or nesting subtasks more than one level deep.
- Subtask categories, priorities, due dates, or descriptions.
- Filtering or searching the task list by subtask text.
- Exposing subtasks on the stub pages (`dashboard`, `calendar`, `projects`, `settings`).
- Tests. The project's `CLAUDE.md` declares "No tests: this is a smoke test target, not a tested app." See [Testing strategy](#testing-strategy).

## Scope

Single-feature spec touching `app/types.ts`, `app/db.ts`, and `app/page.tsx`. No decomposition needed; the three files share interfaces (the `Task`/`Subtask` shape and the `db` API) and must be changed together to land a working feature.

## Design

### Data model (`app/types.ts`)

Add a `Subtask` interface and extend `Task`:

```ts
export interface Subtask {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
}

export interface Task {
  // ...existing fields unchanged...
  subtasks: Subtask[]; // required; empty array means "no subtasks"
}
```

`subtasks` is required (not optional). All code paths that construct a `Task` populate it, and the v2 migration guarantees the field exists on every persisted row before any read path runs. Making it required removes a class of `task.subtasks ?? []` defensive reads from the UI.

`Subtask.done` is a boolean rather than a three-state status — the rollup rule only needs done/not-done, and the issue does not ask for an in-progress subtask state.

### Storage migration (`app/db.ts`)

Bump `DB_VERSION` from `1` to `2` and extend `onupgradeneeded` to handle the v1 → v2 transition.

```ts
const DB_VERSION = 2;
```

In `onupgradeneeded`, after the existing v1 store-creation block, branch on `event.oldVersion`:

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

Notes:

- The upgrade uses the version-change transaction implicit on the open request (`request.transaction` / `event.target.transaction`), not a fresh transaction. Opening a new transaction inside `onupgradeneeded` would fail.
- The cursor walk is idempotent: if a row already has `subtasks: []` (e.g. a re-run), it is left alone.
- Cleanly created v2 databases (fresh installs) skip the cursor walk entirely because `event.oldVersion === 0` and `oldVersion < 2` is true but the store is empty.
- No new indexes are required on the `subtasks` field; the UI iterates the array in memory.

The public `db.*` methods (`addTask`, `updateTask`, `getTasks`, `getTaskById`, `getTasksByCategory`, `deleteTask`, `addCategory`, `getCategories`) keep their existing signatures. `Task.subtasks` rides along inside the stored object — IndexedDB serialises it transparently. The only practical change for callers is that `updateTask(task)` now persists subtask edits.

### UI (`app/page.tsx`)

Add three handlers alongside the existing `cycleStatus` / `handleSave` / `handleDelete`:

```ts
async function addSubtask(taskId: string, title: string): Promise<void>;
async function toggleSubtask(taskId: string, subtaskId: string): Promise<void>;
async function deleteSubtask(taskId: string, subtaskId: string): Promise<void>;
```

Each one:

1. Finds the parent task in local `tasks` state.
2. Produces an updated `Task` with a new `subtasks` array (immutable update) and a refreshed `updatedAt`.
3. Calls `db.updateTask(updated)` and then `setTasks((prev) => prev.map(...))`.

`addSubtask` generates `id` via `Date.now().toString()` to match the style used for `Task.id`. Empty / whitespace-only titles are ignored (mirrors `handleSave`).

#### Subtask list component

Introduce a small in-file component, **not** a new file, since it is used only on the home page:

```tsx
function SubtaskList({
  task,
  onAdd,
  onToggle,
  onDelete,
}: {
  task: Task;
  onAdd: (title: string) => void;
  onToggle: (subtaskId: string) => void;
  onDelete: (subtaskId: string) => void;
}): JSX.Element;
```

Renders:

- A list of `task.subtasks`, each row containing a circular toggle button (re-uses the visual treatment of the parent status button — checked / empty states only), the subtask title (strike-through when `done`), and a small `Delete` button.
- A trailing input row: an `input` controlled by component-local state plus an `Add` button. Pressing `Enter` or clicking `Add` calls `onAdd(title)` and clears the input.
- When `task.subtasks.length === 0`, render only the input row (no empty-state copy — the UI is dense enough already).

The component sits inside the existing task card, below the `badge` row and above the existing footer actions. It does not change the task card's outer layout; it adds a vertically stacked block at the bottom of the card's content column.

#### Rollup rule in `cycleStatus`

Replace the unconditional `next` table with a guarded transition:

```ts
function canMarkDone(task: Task): boolean {
  return task.subtasks.length > 0 && task.subtasks.every((s) => s.done);
}

async function cycleStatus(task: Task) {
  const current = task.status;
  let nextStatus: Task["status"];
  if (current === "todo") {
    nextStatus = "in-progress";
  } else if (current === "in-progress") {
    nextStatus =
      task.subtasks.length === 0 || canMarkDone(task) ? "done" : "todo";
  } else {
    nextStatus = "todo";
  }
  // ...persist as today...
}
```

Behavior summary:

- Zero subtasks → existing `todo → in-progress → done → todo` cycle (issue says "may be marked done"; zero subtasks is treated as "no rollup constraint").
- ≥1 subtask, all done → cycle behaves as today.
- ≥1 subtask, some not done → clicking the parent's status button while `in-progress` wraps back to `todo` instead of jumping to `done`. The user must finish the subtasks before the parent can read `done`. No error UI; the button's `title` tooltip is extended to read `"Status: In Progress — finish subtasks to mark done"` when the rollup is blocking.

Auto-promotion is one-directional and conservative: toggling a subtask does **not** automatically advance the parent. It only relaxes the cap on `cycleStatus`. This keeps state changes user-driven and avoids surprising the user with a parent that "completes itself."

Auto-demotion: if the parent is `done` and a subtask is toggled back to not-done (or a done subtask is deleted leaving the set incomplete), `toggleSubtask` / `deleteSubtask` downgrades the parent to `in-progress` in the same `db.updateTask` call. This preserves the invariant "parent is `done` ⇒ all subtasks are `done`." `completedAt` is cleared when the demotion happens.

#### Local state

The home component already holds the full `tasks` array, so subtasks ride along inside it. No new top-level `useState` is introduced for subtask data. `SubtaskList` owns the draft-input string in its own `useState`.

### Trade-offs

- **Inline `SubtaskList` vs. a new file in `app/components/`.** The component is used in exactly one place and is small. Splitting it into a separate file would add an indirection the codebase otherwise reserves for shell components (`MainLayout`, `Sidebar`). Picked inline. Rejected because of YAGNI.
- **Boolean `done` vs. three-state subtask status.** A three-state subtask would mirror the parent and let users mark a subtask `in-progress`. The issue does not ask for it and the rollup rule only consults done/not-done. Picked boolean. Rejected three-state because it adds UI surface for no current use.
- **Cap-only rollup vs. auto-promote parent.** "Auto-promote when all subtasks done" would change parent status without a user click, which can surprise users mid-edit. Picked cap-only with auto-demote-on-violation. Rejected full auto-promote because it makes the UI feel jumpy.
- **Backfill via `onupgradeneeded` cursor walk vs. lazy backfill on read.** Lazy backfill would skip the migration code but means `getTasks` returns rows with `subtasks: undefined` until the first write. Picked eager backfill so the `Task.subtasks` field can be a required (non-optional) type. Rejected lazy because it leaks the optional shape into TypeScript.

## Testing strategy

This project explicitly opts out of automated tests. `CLAUDE.md` states "No tests: this is a smoke test target, not a tested app. There is no test suite." There is no `test/`, `tests/`, `spec/`, `__tests__/`, or `e2e/` directory and `package.json` exposes no test script. Introducing a test layer here would violate the project's stated policy and is therefore out of scope.

The layers that DO apply are static checks and manual smoke:

- **Type check** — `pnpm exec tsc` (per `CLAUDE.md`). Must pass with the new `Subtask` interface and the required `subtasks` field on `Task`. Catches: missing field on constructed `Task` literals, signature drift on the new `addSubtask`/`toggleSubtask`/`deleteSubtask` handlers.
- **Lint** — `pnpm lint` (per `CLAUDE.md`, runs `eslint`). Must pass. Catches: unused imports, hook misuse in `SubtaskList`.
- **Build** — `pnpm build`. Must succeed; surfaces production-only issues the dev server can hide.
- **Manual smoke via `pnpm dev`** — exercise on `http://localhost:3000`:
  1. Add a task, add three subtasks, toggle two done, verify parent stays in `in-progress` after a `cycleStatus` click that would normally land on `done`.
  2. Toggle the third subtask done, click the parent's status button, verify the parent now lands on `done`.
  3. Toggle one of the done subtasks back; verify the parent demotes to `in-progress` and the strike-through clears.
  4. Reload the page (forcing a fresh IndexedDB read) and confirm subtasks persist.
  5. To exercise the migration, run the app once on the `main` branch to create v1 rows, then run on the feature branch and confirm the existing tasks load with `subtasks: []` and no console errors.
  6. Delete a subtask that is `done` while the parent is `done` — verify the parent demotes when this leaves a non-empty unfinished set, and stays `done` only if every remaining subtask is still done.

## Open questions

None. The triage rationale and issue body together resolve the storage, UI, and behavioral questions; the design choices above (boolean subtask status, cap-only rollup with auto-demote, inline component) are recorded as decisions with their trade-offs.
