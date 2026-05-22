# Per-task subtasks with completion rollup

Issue: [#98](../../../issues/98) — smoke-20260522-06c5/large

## Problem

The tasks list at `app/page.tsx` treats each task as an atomic unit. Real work often decomposes into smaller steps. We need to let users add a flat list of subtasks under any task, toggle and delete them, and have the parent task's status reflect subtask progress: a parent cannot be `done` while any subtask is incomplete.

The change cuts across the type system (`app/types.ts`), the persistence layer (`app/db.ts`, including an IndexedDB schema migration), and the rendering and status-cycle logic (`app/page.tsx`).

## Goals

- Each `Task` carries an array of `Subtask` records, persisted in IndexedDB.
- Existing rows in the v1 database are migrated to v2 with an empty `subtasks: []` on upgrade.
- Each task card renders a nested subtask list with an inline input to add, a checkbox to toggle, and a delete button per row.
- The parent status cycle (`todo → in-progress → done → todo`) is gated by subtask completion: while any subtask is incomplete, advancing from `in-progress` skips `done` and wraps back to `todo`.
- A task with no subtasks behaves exactly as today.

## Non-goals

- Nested subtasks (a subtask cannot itself have subtasks). The tree is one level deep.
- Subtask metadata beyond title and completion (no priority, due date, category, description).
- Reordering, drag-and-drop, or bulk operations on subtasks.
- A dedicated database method per subtask. Subtasks live inside the parent `Task` row and are written via the existing `db.updateTask` call.
- Filters, search, or sorting over subtask content. Existing filters continue to operate on the parent task only.
- Stats card adjustments. Stats remain task-level counts.

## Design

### Type changes — `app/types.ts`

Add a new `Subtask` interface and a `subtasks` field on `Task`.

```ts
export interface Subtask {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
}

export interface Task {
  // ...existing fields unchanged
  subtasks: Subtask[];
}
```

`subtasks` is required (not optional) on the in-memory type. The migration in `db.ts` guarantees every persisted row has the field, and new tasks are constructed with `subtasks: []`. Making it required forces every call site to handle the array explicitly rather than relying on `?.length` chains.

### Persistence — `app/db.ts`

- Bump `DB_VERSION` from `1` to `2`.
- Extend `onupgradeneeded` to handle the `oldVersion < 2` branch by opening a cursor over the `tasks` store and writing back each record with `subtasks: []` if the field is missing. The existing v1 branch (`!db.objectStoreNames.contains(TASKS_STORE)`) remains so a fresh install still creates the schema in one pass.
- No new object store, no new index. Subtasks are an embedded array on the `Task` row; the existing `addTask` / `updateTask` / `getTasks` / `deleteTask` methods serve them without changes.

Migration sketch:

```ts
request.onupgradeneeded = (event) => {
  const db = (event.target as IDBOpenDBRequest).result;
  const tx = (event.target as IDBOpenDBRequest).transaction!;
  const oldVersion = event.oldVersion;

  if (!db.objectStoreNames.contains(TASKS_STORE)) {
    // ...existing v1 create logic
  }
  if (!db.objectStoreNames.contains(CATEGORIES_STORE)) {
    db.createObjectStore(CATEGORIES_STORE, { keyPath: "id" });
  }

  if (oldVersion < 2 && db.objectStoreNames.contains(TASKS_STORE)) {
    const store = tx.objectStore(TASKS_STORE);
    store.openCursor().onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (!cursor) return;
      const row = cursor.value as Task;
      if (!Array.isArray(row.subtasks)) {
        cursor.update({ ...row, subtasks: [] });
      }
      cursor.continue();
    };
  }
};
```

The cursor walk runs inside the version-change transaction supplied by `event.target.transaction`; we must NOT open a new transaction inside `onupgradeneeded`.

### Rollup rule

Define a single helper in `app/page.tsx`:

```ts
function canBeDone(task: Task): boolean {
  return task.subtasks.length === 0 || task.subtasks.every((s) => s.done);
}
```

- `cycleStatus` consults `canBeDone(task)` when transitioning from `in-progress`. If the parent has unfinished subtasks, the next status is `todo` rather than `done`.
- When toggling the last incomplete subtask to `done`, the parent's status is left as-is — auto-promotion is out of scope. Only the manual cycle is gated.
- When a parent that is already `done` has a subtask toggled back to incomplete, the parent is demoted to `in-progress` and `completedAt` is cleared. This is necessary to keep the invariant "a parent in `done` has all subtasks done" true at all times, and matches the issue's "parent is at most in-progress" wording.

### Subtask operations

Add three handlers in `app/page.tsx`, each producing a new `Task` and routing through `db.updateTask`:

```ts
async function addSubtask(parent: Task, title: string): Promise<void>;
async function toggleSubtask(parent: Task, subtaskId: string): Promise<void>;
async function deleteSubtask(parent: Task, subtaskId: string): Promise<void>;
```

Contracts:

- `addSubtask` no-ops on an empty/whitespace title. On success appends `{ id: crypto.randomUUID(), title: title.trim(), done: false, createdAt: now }`, bumps the parent's `updatedAt`, persists, and updates state.
- `toggleSubtask` flips `done` on the matching subtask. If this transition would violate the rollup invariant (parent is `done` but a subtask is now incomplete), the same update also sets the parent's `status` to `in-progress` and clears `completedAt`. Bumps `updatedAt`.
- `deleteSubtask` removes the subtask by id. No status side-effect: removing the last incomplete subtask does not auto-promote a parent.

All three reuse the existing optimistic-update pattern (`setTasks((prev) => prev.map(...))` after `await db.updateTask`).

### UI — task card

Inside the existing task-card render loop in `app/page.tsx`, after the badge row and before the closing card `<div>`, render a `SubtaskList` block (inline JSX, no new component file — this keeps consistent with the rest of the page which is one large component):

- A header row reading `Subtasks (n done / m total)` rendered as a small muted line. Hidden when both `n` and `m` are zero, but the add input is still shown so users can start adding.
- For each subtask: a checkbox bound to `subtask.done`, the title (line-through and muted when done, matching parent task styling), and a small "×" delete button on the right.
- A single inline input at the bottom of the list with placeholder "Add subtask…". Submits on Enter via the same pattern as the main title input. The input's value lives in a `subtaskDrafts: Record<string, string>` map keyed by parent task id, kept in component state. After a successful add, the entry for that parent is cleared.

Visual treatment uses existing CSS variables (`var(--text-muted)`, `var(--border-hover)`) and the same `input` / `btn btn-ghost btn-sm` classes used elsewhere. No new Tailwind classes or CSS variables are introduced.

### Status-toggle tooltip

The status button's `title` attribute is extended when `!canBeDone(task)` to read `Status: ${statusLabel} — complete all subtasks to mark done`. This is the only affordance hinting that the cycle is gated; we are not introducing a disabled state or a distinct color for the button.

## Trade-offs

**Embed subtasks vs. separate object store.** Rejected: a dedicated `subtasks` store keyed on `taskId` would scale to large lists and allow indexed queries, but every read path in this app already fetches the full task list, and the issue's add/toggle/delete operations are all parent-scoped. An embedded array is one transactional write per change and zero extra index plumbing. YAGNI applies.

**Auto-promote parent to `done` on last subtask check vs. manual cycle only.** Rejected: auto-promotion would feel magical for users editing a long checklist and would also need to decide what to do when the parent was previously `todo` (jump straight to `done`? to `in-progress`?). Keeping promotion manual and only gating the cycle keeps the rule one line of code and the user model predictable. Demotion *is* automatic because it preserves a hard invariant; promotion is not, because it only suppresses a convenience.

**Required `subtasks: []` vs. optional `subtasks?`.** Rejected optional: every read site would need a `?? []` fallback. Since the migration guarantees the field on every persisted row and the constructor in `handleSave` sets it, "required and always an array" is the cleaner contract.

## Scope

Single subsystem: the tasks page and its supporting type / persistence layer. No decomposition is needed and no separate follow-up issues are produced from this spec.

The spec also fixes one adjacent gap that falls out of the design: `handleSave` currently does not initialize a `subtasks` field on freshly created tasks; the new code will set `subtasks: existing?.subtasks ?? []` so edits preserve subtasks and new tasks start empty. This is required to make the type change land cleanly and is not a drive-by refactor.

## Testing strategy

This project has no test suite. `CLAUDE.md` states explicitly: *"No tests: this is a smoke test target, not a tested app. There is no test suite."* `package.json` defines only `dev`, `build`, `start`, and `lint` scripts; there is no test runner, no `test/` or `__tests__/` directory, and no testing dependencies.

Per the rules of this spec, we may not introduce a layer the project does not already exercise. The applicable verification layers are therefore:

- **Type check — `pnpm exec tsc`.** Validates the new `Subtask` interface, the required `subtasks: Subtask[]` field on `Task`, the signatures of `addSubtask` / `toggleSubtask` / `deleteSubtask`, the `canBeDone` helper, and that every existing `Task` construction site in `app/page.tsx` supplies the new field. This is the primary correctness gate.
- **Lint — `pnpm lint`.** Catches unused variables and React hook misuse in the new state (`subtaskDrafts`) and handlers.
- **Production build — `pnpm build`.** Confirms the page still compiles under Next.js in production mode.
- **Manual smoke in `pnpm dev`.** Required by `CLAUDE.md`'s standard workflow for UI changes. The implementer should manually exercise: (a) creating a task with no subtasks behaves as before; (b) adding/toggling/deleting subtasks persists across a page reload; (c) clicking the status circle on a task with an unfinished subtask cycles `todo → in-progress → todo` (skips `done`); (d) toggling a subtask back to incomplete on a `done` parent demotes the parent to `in-progress` and clears the gold ring; (e) opening a v1 database (an existing browser profile with tasks) loads cleanly under v2 with `subtasks: []` backfilled — verifiable via DevTools → Application → IndexedDB → TodoApp.

- **Unit tests, integration tests, e2e tests, snapshot tests:** not applicable. The project does not exercise these layers and this spec does not introduce them.

## Open questions

None. All ambiguity in the issue body is resolved by the decisions in **Design** and **Trade-offs** above; assumptions (e.g. demote-on-uncheck, no auto-promote, flat one-level tree) are recorded next to the relevant section.
