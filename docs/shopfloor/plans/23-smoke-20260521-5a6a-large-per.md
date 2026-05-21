# Plan — Per-task subtasks with completion rollup

Issue: [#23](https://github.com/niranjan94/shopfloor-smoke/issues/23)
Spec: [`docs/shopfloor/specs/23-smoke-20260521-5a6a-large-per.md`](../specs/23-smoke-20260521-5a6a-large-per.md)
Slug: `smoke-20260521-5a6a-large-per`

## Context for the implementer

A read of the working tree at planning time shows the three target files
(`app/types.ts`, `app/db.ts`, `app/page.tsx`) already implement the spec
contract end to end. Per the spec's "Implementation note for downstream
stages":

> The implement stage should diff against this spec, confirm the
> contract is satisfied, and produce a no-op or minimal-correction
> patch rather than re-writing the feature. Any divergence from the
> contract above must be reconciled in favor of the spec.

Each task below is a **verify-and-reconcile** task: read the named file,
diff it against the listed acceptance criteria, and either (a) leave it
untouched if the contract holds, or (b) produce the minimum edit that
brings it into compliance. Tasks that touch production behavior MUST
re-run the project's verification layers after any change; verification
tasks with no diff MAY skip re-running layers that already passed in an
earlier task in this plan.

## Testing strategy

Reproduced verbatim from the spec — the implement stage MUST NOT
introduce a test framework.

> This project has no test framework (`package.json` has only `dev`,
> `build`, `start`, `lint`; `CLAUDE.md` states "No tests: this is a smoke
> test target, not a tested app. There is no test suite."). The
> implement stage MUST NOT introduce a test framework as a side effect.
>
> Layers that apply:
>
> - **Type check** — `pnpm exec tsc`. Catches that `Task.subtasks` is
>   threaded consistently (required field, never `undefined`) and that
>   the `Subtask` interface is exported and consumed correctly in
>   `page.tsx`.
> - **Lint** — `pnpm lint`. Runs `eslint` with `eslint-config-next`.
>   Catches unused imports / vars and React rule violations in
>   `SubtaskList` and the new handlers.
> - **Production build** — `pnpm build`. `next build` re-runs TypeScript
>   and bundles; catches any client/server boundary slip (this page is
>   `"use client"`, which must stay).
> - **Manual smoke** — `pnpm dev` and exercise the page in a real
>   browser, because the storage layer is IndexedDB and there is no
>   headless harness for it in this repo.

**Per-task verification shape.** Because there is no unit / integration
/ e2e harness, the TDD five-step shape does not apply. Each feature task
substitutes the following verification shape, which maps onto the layers
above:

1. Read the named file(s) and diff against the acceptance criteria.
2. If the contract holds, do nothing and skip to step 5.
3. If the contract does NOT hold, make the minimum edit.
4. Re-run the verification layers named on the task: `pnpm exec tsc`,
   `pnpm lint`, and (where called out) `pnpm build`. Each MUST exit 0.
5. Commit only if step 3 produced a diff. The commit message is the
   one stated on the task header; verbatim, no embellishment. If
   there is no diff, do not create an empty commit.

Layers explicitly **not applicable** to any task in this plan: unit
tests, integration tests, e2e tests, snapshot tests. Do not add any.

## Task list

The tasks below are ordered bottom-up: type → storage → helper → UI
component → handlers → status-cycle guard → final whole-tree
verification → manual smoke. Each task lists its acceptance criteria
as a literal checklist that the implementer can grep / read against.

---

### Task 1 — Verify `Subtask` type and `Task.subtasks` field

**Files**
- Modify (if divergent): `app/types.ts`

**Acceptance criteria — `app/types.ts` MUST contain:**

- An exported `Subtask` interface with exactly these fields and types:
  - `id: string`
  - `title: string`
  - `done: boolean`
  - `createdAt: string`
- An exported `Task` interface that includes `subtasks: Subtask[]` as a
  **required** field (no `?`). All other existing `Task` fields stay
  unchanged.
- No new fields beyond what the spec lists. In particular, `Subtask`
  has no `description`, `priority`, `dueDate`, or `parentId`.

**Procedure**

1. Read `app/types.ts`.
2. Compare against the criteria above.
3. If any criterion fails, edit `app/types.ts` to match. Do not
   reorder unrelated fields. Do not add JSDoc.
4. Run `pnpm exec tsc` only if step 3 produced a diff. Expected exit
   code: `0`.

**Commit (only if step 3 produced a diff)**

```
fix(types): align Subtask and Task.subtasks with spec
```

---

### Task 2 — Verify IndexedDB v2 migration with cursor backfill

**Files**
- Modify (if divergent): `app/db.ts`

**Acceptance criteria — `app/db.ts` MUST satisfy:**

- `const DB_VERSION = 2;`
- `import { Task, Category, Subtask } from "./types";` (or equivalent
  — `Subtask` MUST be importable by name from `./types` and used by
  the cursor block below).
- Inside `request.onupgradeneeded`, after the existing
  `if (!db.objectStoreNames.contains(TASKS_STORE)) { ... }` and
  `if (!db.objectStoreNames.contains(CATEGORIES_STORE)) { ... }`
  blocks, an additional branch guarded by
  `if (event.oldVersion < 2) { ... }`. That branch:
  - Obtains the upgrade transaction with
    `(event.target as IDBOpenDBRequest).transaction!` (NOT a new
    `db.transaction(...)` call — only the upgrade transaction is
    valid during `onupgradeneeded`).
  - Opens a cursor on `TASKS_STORE`.
  - For every row whose `subtasks` is not an array, sets
    `row.subtasks = []` and writes back with `cursor.update(row)`.
  - Calls `cursor.continue()` until the cursor result is null.
- No new object stores, no new indexes on `tasks`, no changes to the
  signatures of `addTask`, `updateTask`, `deleteTask`, `getTasks`,
  `getTaskById`, `getTasksByCategory`, `addCategory`, or
  `getCategories`.

**Reference implementation (from the spec — match this shape):**

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

**Procedure**

1. Read `app/db.ts`.
2. Compare against the criteria above. In particular, confirm the
   cursor branch uses the upgrade transaction (NOT a fresh
   `database.transaction(...)`), and that the `Subtask` import is
   present.
3. If divergent, make the minimum edit to match the reference shape.
4. Run `pnpm exec tsc` only if step 3 produced a diff. Expected exit
   code: `0`.

**Commit (only if step 3 produced a diff)**

```
fix(db): align v2 subtask backfill with spec
```

---

### Task 3 — Verify `allSubtasksDone` helper in `app/page.tsx`

**Files**
- Modify (if divergent): `app/page.tsx`

**Acceptance criteria**

- `app/page.tsx` exports nothing new but defines a module-level
  function with this exact signature and body semantics:

  ```ts
  function allSubtasksDone(task: Task): boolean {
    return task.subtasks.length > 0 && task.subtasks.every((s) => s.done);
  }
  ```

- The helper is referenced by both `cycleStatus` (Task 6) and the
  status-button `title` attribute (Task 6).
- The function is declared outside of `Home` (module scope), not
  inside the component, so it is not re-created on every render.

**Procedure**

1. Read `app/page.tsx` and locate `allSubtasksDone`.
2. Verify the signature, body, and module-scope placement match.
3. If divergent, edit to match.
4. Run `pnpm exec tsc` and `pnpm lint` only if step 3 produced a diff.
   Both MUST exit `0`.

**Commit (only if step 3 produced a diff)**

```
fix(tasks): align allSubtasksDone helper with spec
```

---

### Task 4 — Verify `SubtaskList` component in `app/page.tsx`

**Files**
- Modify (if divergent): `app/page.tsx`

**Acceptance criteria**

- A local function component named `SubtaskList` is declared at module
  scope in `app/page.tsx` with this exact props shape:

  ```ts
  {
    task: Task;
    onAdd: (title: string) => void;
    onToggle: (subtaskId: string) => void;
    onDelete: (subtaskId: string) => void;
  }
  ```

- Behavior — the component MUST:
  - Render every entry in `task.subtasks` (in array order) as a row
    containing: a circular toggle button (styled like the parent's
    status button — gold accent when `done`), the subtask title
    (strike-through + muted color when `done`), and a `Delete`
    button.
  - Maintain a local `useState<string>` for the add-input draft.
  - Submit on `Enter` key OR on click of the `Add` button.
  - Trim the draft on submit. Empty / whitespace-only drafts are
    dropped silently (no call to `onAdd`).
  - Clear the input after a successful submit.
  - Hold no task state of its own. All mutations go through `onAdd`,
    `onToggle`, and `onDelete`.
- The component is rendered inside the existing task-card body,
  immediately after the badges row (category / status / priority /
  due-date badges), inside the same content `<div>` that holds the
  title and description.

**Procedure**

1. Read `app/page.tsx` and locate `SubtaskList`.
2. Verify props, the four behaviors above, and the render site.
3. If divergent, edit to match. Preserve the existing styling tokens
   (`var(--accent-gold)`, `var(--border-hover)`, etc.) — do not
   introduce new CSS variables or Tailwind utilities.
4. Run `pnpm exec tsc` and `pnpm lint` only if step 3 produced a diff.
   Both MUST exit `0`.

**Commit (only if step 3 produced a diff)**

```
fix(tasks): align SubtaskList component with spec
```

---

### Task 5 — Verify subtask handlers (`addSubtask`, `toggleSubtask`, `deleteSubtask`)

**Files**
- Modify (if divergent): `app/page.tsx`

**Acceptance criteria — three async methods inside `Home`:**

**`addSubtask(taskId: string, rawTitle: string): Promise<void>`**

- Trims `rawTitle`. If the trimmed title is empty, returns without
  side effects.
- Finds the parent in the current `tasks` state. If not found, returns
  without side effects.
- Constructs a new `Subtask` with `id = Date.now().toString()`,
  `title = trimmed`, `done = false`, `createdAt = new Date().toISOString()`.
- Appends the new subtask to `parent.subtasks` (immutable spread, NOT
  in-place `push`).
- Sets `updatedAt` to the same `now`.
- If `parent.status === "done"`, demotes the parent to
  `"in-progress"` and clears `completedAt` (sets to `undefined`).
  Otherwise leaves `status` and `completedAt` alone.
- Persists via `db.updateTask(updated)` and updates local state with
  `setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)))`.
- Errors are caught and `console.error`'d, matching the surrounding
  handlers' error style.

**`toggleSubtask(taskId: string, subtaskId: string): Promise<void>`**

- Finds the parent; returns if not found.
- Builds `nextSubtasks` by flipping `done` on the matching subtask
  via immutable `.map`.
- Computes `allDone = nextSubtasks.length > 0 && nextSubtasks.every((s) => s.done)`.
- `demote = parent.status === "done" && !allDone`.
- When `demote` is true, sets `status = "in-progress"` and clears
  `completedAt`. Otherwise leaves both alone.
- **MUST NOT** promote the parent to `done` when the last subtask is
  checked. Promotion stays user-driven (see Task 6).
- Persists and updates local state.

**`deleteSubtask(taskId: string, subtaskId: string): Promise<void>`**

- Finds the parent; returns if not found.
- Builds `nextSubtasks = parent.subtasks.filter((s) => s.id !== subtaskId)`.
- Computes `allDone = nextSubtasks.length > 0 && nextSubtasks.every((s) => s.done)`.
- `demote = parent.status === "done" && nextSubtasks.length > 0 && !allDone`.
  Note the **three** conditions — deleting until zero subtasks remain
  MUST NOT demote a `done` parent.
- When `demote` is true, sets `status = "in-progress"` and clears
  `completedAt`. Otherwise leaves both alone.
- Persists and updates local state.

**Rollup invariant** (verified by reading the three handlers and
`cycleStatus`): after any of these mutations, if
`task.status === "done"` then `task.subtasks.length === 0` OR every
subtask is `done`.

**Procedure**

1. Read `app/page.tsx` and locate the three handlers.
2. Diff each against the criteria above. Pay particular attention to
   the asymmetric rollup in `toggleSubtask` (no auto-promote) and the
   triple-guard in `deleteSubtask`.
3. If divergent, edit to match.
4. Run `pnpm exec tsc` and `pnpm lint` only if step 3 produced a diff.
   Both MUST exit `0`.

**Commit (only if step 3 produced a diff)**

```
fix(tasks): align subtask handlers with spec rollup
```

---

### Task 6 — Verify `cycleStatus` rollup guard and status-button tooltip

**Files**
- Modify (if divergent): `app/page.tsx`

**Acceptance criteria**

- `cycleStatus(task: Task)` MUST implement the status cycle as:
  - `todo` → `in-progress`
  - `in-progress` → `done` **iff** `task.subtasks.length === 0 || allSubtasksDone(task)`,
    else `todo` (loop back, do NOT stay at `in-progress`).
  - `done` → `todo`
- When transitioning to `done`, `completedAt` is set to the current
  ISO timestamp. On any other transition, `completedAt` is cleared
  (set to `undefined`).
- `updatedAt` is always set to the same `now` value.
- The status button's `title` attribute MUST be:
  - `"Status: ${statusLabel(task.status)} — finish subtasks to mark done"`
    when `task.status === "in-progress"` AND `task.subtasks.length > 0`
    AND `!allSubtasksDone(task)`.
  - `"Status: ${statusLabel(task.status)} — click to advance"` otherwise.
- The button still calls `cycleStatus(task)` on click. No new
  disabled-state logic; the button stays clickable in the blocked
  state and simply cycles back to `todo` per the spec.

**Reference shape for the `in-progress` arm of `cycleStatus`:**

```ts
if (current === "in-progress") {
  nextStatus =
    task.subtasks.length === 0 || allSubtasksDone(task)
      ? "done"
      : "todo";
}
```

**Procedure**

1. Read `cycleStatus` and the status-button JSX in `app/page.tsx`.
2. Compare against the criteria above.
3. If divergent, edit to match.
4. Run `pnpm exec tsc` and `pnpm lint` only if step 3 produced a diff.
   Both MUST exit `0`.

**Commit (only if step 3 produced a diff)**

```
fix(tasks): align cycleStatus rollup guard and tooltip with spec
```

---

### Task 7 — Final whole-tree verification

**Files**
- Read-only.

**Procedure**

1. Run `pnpm exec tsc`. Expected exit code: `0`. Expected stdout:
   empty.
2. Run `pnpm lint`. Expected exit code: `0`. Expected stdout: no
   error lines; the next-lint summary line is acceptable.
3. Run `pnpm build`. Expected exit code: `0`. Expected stdout
   includes `Compiled successfully` (or the next-build equivalent for
   the installed Next version) and no TypeScript errors. This task is
   the only one that runs `pnpm build`.
4. If any of the three commands fails, fix the smallest set of files
   that satisfies the failing layer without changing the behavioral
   contract established in Tasks 1 through 6. Re-run the failed
   command after the fix.

**Non-feature task — TDD shape does not apply** (this is a build /
lint / typecheck verification pass, not a behavior change).

**Commit (only if step 4 produced a diff)**

```
chore(tasks): fix lint or typecheck regressions from subtask work
```

If steps 1 through 3 all pass with no edits, do NOT create a commit
for this task.

---

### Task 8 — Manual smoke checklist (documentation only)

**Files**
- Read-only.

**Non-feature task — TDD shape does not apply.** This task records the
nine-step manual smoke from the spec so the implementer can run it
locally with `pnpm dev` before reporting the PR ready. None of the
steps below is automated; if the implementer is running in a
headless environment, they MUST state explicitly in the PR body that
the manual smoke could not be executed and which automated layers
(`tsc`, `lint`, `build`) passed instead. **Do not invent a passing
smoke.**

**Steps (reproduced from the spec):**

1. Load the page with an existing v1 database. Open DevTools →
   Application → IndexedDB → `TodoApp`. Confirm version is `2` and
   every task row has `subtasks: []`.
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
   zero subtasks remain leaves the parent `done`.

**No commit.** This task produces no diff.

---

## Expected outcome

Given the working-tree-at-planning-time state, the most likely outcome
is: Tasks 1 through 6 are all no-op verifications, Task 7 passes with
no edits, and Task 8 is the only step that actually exercises behavior
(manually). The PR ships either as an empty-diff "verification PR" or
with at most a handful of minimal-correction commits, one per
divergent file. **Do not** rewrite, refactor, or "improve" code that
already satisfies the contract — the spec explicitly says the
implement stage should produce "a no-op or minimal-correction patch
rather than re-writing the feature."
