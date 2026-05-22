# Plan: Per-task subtasks with completion rollup

Issue: niranjan94/shopfloor-smoke#79
Spec: `docs/shopfloor/specs/79-smoke-20260522-7e4b-large-per.md`
Triage class: large

## Overview

Implement nested subtasks under each task on the home page (`app/page.tsx`), persisted alongside their parent in IndexedDB. The work proceeds in five ordered tasks:

1. Add the `Subtask` interface and the required `subtasks` field on `Task` (`app/types.ts`).
2. Bump IndexedDB to v2 with a cursor backfill that puts `subtasks: []` on every existing row (`app/db.ts`).
3. Add the pure rollup helpers in a new module (`app/rollup.ts`).
4. Wire the rollup into task creation and the status cycle (`app/page.tsx`).
5. Add the subtask UI (counter, list, add/toggle/delete) inside each task card (`app/page.tsx`).

The five tasks are sequenced so that each one compiles on its own and only the last one introduces user-visible UI. The implementer should execute them in order.

## Testing strategy

Reproduced verbatim from the spec's `## Testing strategy` section.

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

Each implementation task below references these layers explicitly. The "manual smoke" layer runs once at the end (Task 5); intermediate tasks rely on `pnpm exec tsc` and `pnpm lint`.

---

## Task 1 — Add `Subtask` type and required `subtasks` field on `Task`

**Files**
- Modify: `app/types.ts`

**Goal**: introduce the `Subtask` interface and add `subtasks: Subtask[]` (required, non-optional) to `Task`. This is a type-only change; nothing compiles until the call sites in later tasks are updated, so this task is intentionally a "type break" that the next four tasks fix.

**Implementation**

Replace the entire contents of `app/types.ts` with:

```ts
export interface Subtask {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
}

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
  subtasks: Subtask[];
}

export interface Category {
  id: string;
  name: string;
  color: string;
}
```

**Verification** (non-feature task — type-only definition change; no behavior to test):

1. Run `pnpm exec tsc`. **Expected:** failures in `app/page.tsx` only, at the `Task` object literal inside `handleSave` (line ~71) reporting that property `subtasks` is missing. No other files should fail. These failures will be resolved in Task 4.
2. Run `pnpm lint`. **Expected:** clean.

**Commit message** (verbatim):

```
feat(types): add Subtask interface and required subtasks field on Task
```

---

## Task 2 — IndexedDB v2 migration with cursor backfill

**Files**
- Modify: `app/db.ts`

**Goal**: bump `DB_VERSION` from `1` to `2` and extend `onupgradeneeded` so that when an existing browser opens the app for the first time at v2, every row in the `tasks` store gains `subtasks: []`. Fresh browsers (oldVersion = 0) still get the store + indexes created by the v0→v1 branch.

**Implementation**

In `app/db.ts`:

1. Add `Subtask` to the import from `./types` so the migration code can reference it:

   ```ts
   import { Task, Category, Subtask } from "./types";
   ```

2. Change `const DB_VERSION = 1;` to `const DB_VERSION = 2;`.

3. Replace the existing `request.onupgradeneeded = (event) => { ... };` block with the version-aware form below. The v0→v1 logic is unchanged; the v1→v2 logic is new.

   ```ts
   request.onupgradeneeded = (event) => {
     const db = (event.target as IDBOpenDBRequest).result;
     const tx = (event.target as IDBOpenDBRequest).transaction!;
     const oldVersion = event.oldVersion;

     if (oldVersion < 1) {
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
   };
   ```

   Notes for the implementer:
   - Do **not** open a new transaction inside `onupgradeneeded`. The version-change transaction is on `event.target.transaction` and is the only transaction allowed during an upgrade.
   - The `Array.isArray` guard makes the migration idempotent: if a second tab triggers the upgrade after a partial run, already-backfilled rows are left alone.
   - No new index is created. Subtasks live as a serialized array on the parent row.

The rest of `app/db.ts` (the `db` object's method bodies) is unchanged. `addTask` / `updateTask` / `getTasks` already round-trip the full task object, including the new `subtasks` field.

**Verification** (non-feature task — schema migration is exercised only via the manual smoke in Task 5):

1. Run `pnpm exec tsc`. **Expected:** the same `handleSave`-missing-`subtasks` failure as Task 1; `app/db.ts` itself must compile cleanly.
2. Run `pnpm lint`. **Expected:** clean.

**Commit message** (verbatim):

```
feat(db): bump IndexedDB to v2 and backfill subtasks on existing rows
```

---

## Task 3 — Add pure rollup helpers in `app/rollup.ts`

**Files**
- Create: `app/rollup.ts`

**Goal**: a tiny pure-function module so the cap rules are reused by both the parent status toggle and the subtask mutators. Depends only on the `Task` type — no DB, no React.

**Implementation**

Create `app/rollup.ts` with exactly the following contents:

```ts
import { Task } from "./types";

export function allSubtasksDone(task: Task): boolean {
  return task.subtasks.every((s) => s.done);
}

export function clampParentStatus(task: Task): Task["status"] {
  if (task.status === "done" && !allSubtasksDone(task)) {
    return "in-progress";
  }
  return task.status;
}

export function nextStatusForCycle(task: Task): Task["status"] {
  if (task.status === "todo") return "in-progress";
  if (task.status === "in-progress") {
    return allSubtasksDone(task) ? "done" : "todo";
  }
  return "todo";
}
```

Semantics (matches the spec):

- `allSubtasksDone` is `true` when `task.subtasks` is empty (vacuous `every`). This is intentional: a task with zero subtasks is unconstrained.
- `clampParentStatus` only ever pulls `done` back to `in-progress`; it never advances a status. Use it after subtask mutations.
- `nextStatusForCycle` mirrors today's `todo → in-progress → done → todo` cycle, except `in-progress → done` becomes `in-progress → todo` when at least one subtask is still open. This preserves the "every click moves you somewhere" UX.

**Verification** (non-feature task — pure helpers with no separate test layer; behavior is exercised via Task 5's manual smoke):

1. Run `pnpm exec tsc`. **Expected:** the same `handleSave`-missing-`subtasks` failure as Tasks 1–2; `app/rollup.ts` itself must compile cleanly.
2. Run `pnpm lint`. **Expected:** clean.

**Commit message** (verbatim):

```
feat(rollup): add pure helpers for parent status clamp and cycle
```

---

## Task 4 — Wire rollup into task creation and status cycle in `app/page.tsx`

**Files**
- Modify: `app/page.tsx`

**Goal**: make `handleSave` initialize `subtasks` (closing the type breaks from Tasks 1–3) and replace the inline `next` map in `cycleStatus` with `nextStatusForCycle`. No UI changes yet — that's Task 5.

**Implementation**

1. Update the import at the top of `app/page.tsx`:

   - Change `import { Task, Category } from "./types";` to `import { Task, Category, Subtask } from "./types";`.
   - Add a new import: `import { allSubtasksDone, clampParentStatus, nextStatusForCycle } from "./rollup";`.

   `Subtask` will be unused until Task 5; if `pnpm lint` flags the unused import, defer adding `Subtask` to Task 5 and import only the three rollup helpers here.

2. In `handleSave` (currently at lines 67–93), update the `task` object literal so that `subtasks` is preserved on edits and initialized to `[]` on create. Replace the existing `const task: Task = { ... };` block with:

   ```ts
   const task: Task = {
     id: editingId || Date.now().toString(),
     title: title.trim(),
     description: description.trim() || undefined,
     category,
     priority,
     status: existing?.status ?? "todo",
     dueDate: dueDate || undefined,
     createdAt: existing?.createdAt ?? now,
     updatedAt: now,
     completedAt: existing?.completedAt,
     subtasks: existing?.subtasks ?? [],
   };
   ```

   Rationale: the edit form does not expose subtask fields, so an edit must round-trip the existing array. A fresh create starts with `[]`.

3. Replace the body of `cycleStatus` (currently at lines 116–128) so it routes through `nextStatusForCycle`:

   ```ts
   async function cycleStatus(task: Task) {
     const nextStatus = nextStatusForCycle(task);
     const updated: Task = {
       ...task,
       status: nextStatus,
       completedAt: nextStatus === "done" ? new Date().toISOString() : undefined,
       updatedAt: new Date().toISOString(),
     };
     try {
       await db.updateTask(updated);
       setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
     } catch (e) { console.error(e); }
   }
   ```

   Note: `completedAt` is cleared whenever the new status is not `"done"` (covering both `"todo"` and `"in-progress"`). This matches the existing behavior plus the new spec rule that `in-progress → todo` (when subtasks are open) clears `completedAt`.

4. `clampParentStatus` and `allSubtasksDone` are not used in this task; they will be consumed by the subtask mutators added in Task 5. If `pnpm lint` flags these as unused, defer their imports to Task 5.

**Verification** (feature task — modifies production behavior; the project's testing strategy names only the type-check, lint, and manual-smoke layers, so steps 1–4 of the TDD shape collapse into the type-check + lint pair, and the behavior is exercised end-to-end in Task 5):

1. Failing-test stand-in: run `pnpm exec tsc`. **Expected before this task's edits:** the `handleSave` `subtasks` failure persists from Tasks 1–3.
2. Apply this task's edits.
3. Run `pnpm exec tsc`. **Expected:** clean (no type errors anywhere in the project).
4. Run `pnpm lint`. **Expected:** clean. If `Subtask`, `clampParentStatus`, or `allSubtasksDone` are flagged as unused imports, remove them here and re-import them in Task 5 where they are first used.

**Commit message** (verbatim):

```
feat(page): initialize task subtasks and route status cycle through rollup
```

---

## Task 5 — Subtask UI: counter, list, add / toggle / delete inside each task card

**Files**
- Modify: `app/page.tsx`

**Goal**: render the subtask UI inside each task card and add the three mutator handlers. After this task ships, the feature is complete and the manual smoke checklist runs.

**Implementation**

1. Import additions (if any were deferred from Task 4):

   - Ensure the line reads: `import { Task, Category, Subtask } from "./types";`
   - Ensure the line reads: `import { allSubtasksDone, clampParentStatus, nextStatusForCycle } from "./rollup";`

2. Add a per-card draft-text state inside the `Home` component, alongside the existing `useState` hooks (after `const [loading, setLoading] = useState(true);` around line 47):

   ```ts
   const [subtaskDrafts, setSubtaskDrafts] = useState<Record<string, string>>({});
   ```

3. Add three new handlers inside the `Home` component, immediately after `cycleStatus`. Each one builds the new subtask array, clamps the parent status, persists via `db.updateTask`, and updates local state.

   ```ts
   async function persistTaskUpdate(updated: Task) {
     try {
       await db.updateTask(updated);
       setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
     } catch (e) { console.error(e); }
   }

   async function handleAddSubtask(parent: Task, rawTitle: string) {
     const title = rawTitle.trim();
     if (!title) return;
     const now = new Date().toISOString();
     const newSubtask: Subtask = {
       id: Date.now().toString(),
       title,
       done: false,
       createdAt: now,
     };
     const nextSubtasks = [...parent.subtasks, newSubtask];
     const candidate: Task = { ...parent, subtasks: nextSubtasks, updatedAt: now };
     const clampedStatus = clampParentStatus(candidate);
     const updated: Task = {
       ...candidate,
       status: clampedStatus,
       completedAt: clampedStatus === "done" ? parent.completedAt : undefined,
     };
     setSubtaskDrafts((prev) => ({ ...prev, [parent.id]: "" }));
     await persistTaskUpdate(updated);
   }

   async function handleToggleSubtask(parent: Task, subtaskId: string) {
     const now = new Date().toISOString();
     const nextSubtasks = parent.subtasks.map((s) =>
       s.id === subtaskId ? { ...s, done: !s.done } : s
     );
     const candidate: Task = { ...parent, subtasks: nextSubtasks, updatedAt: now };
     const clampedStatus = clampParentStatus(candidate);
     const updated: Task = {
       ...candidate,
       status: clampedStatus,
       completedAt: clampedStatus === "done" ? parent.completedAt : undefined,
     };
     await persistTaskUpdate(updated);
   }

   async function handleDeleteSubtask(parent: Task, subtaskId: string) {
     const now = new Date().toISOString();
     const nextSubtasks = parent.subtasks.filter((s) => s.id !== subtaskId);
     const candidate: Task = { ...parent, subtasks: nextSubtasks, updatedAt: now };
     const clampedStatus = clampParentStatus(candidate);
     const updated: Task = {
       ...candidate,
       status: clampedStatus,
       completedAt: clampedStatus === "done" ? parent.completedAt : undefined,
     };
     await persistTaskUpdate(updated);
   }
   ```

   Notes:
   - `clampParentStatus` only ever moves `done` back to `in-progress`; it never advances. So `completedAt` is cleared whenever the clamped status is not `"done"`. When the clamped status remains `"done"` (because the parent was already not done, or because all subtasks are still done), the original `parent.completedAt` is preserved.
   - Auto-promotion is intentionally **not** implemented (per spec trade-off). Even when the user toggles the last open subtask, the parent stays at whatever status it had — they must click the parent toggle themselves.

4. Update the parent's status-toggle `title` (currently at line 299) to surface the rollup constraint. Replace:

   ```tsx
   title={`Status: ${statusLabel(task.status)} — click to advance`}
   ```

   with:

   ```tsx
   title={
     task.status === "in-progress" && !allSubtasksDone(task)
       ? "Status: In Progress — complete all subtasks to mark done"
       : `Status: ${statusLabel(task.status)} — click to advance`
   }
   ```

5. Render the subtask block inside each task card. Insert the JSX below **immediately before the closing `</div>` of the `Content` div** — that closing tag is at line 355 in the pre-task source (the `</div>` directly after the badges row that ends with `task.dueDate && (...)` and `</div>`). The subtask block lives inside the same `<div style={{ flex: 1, minWidth: 0 }}>` that holds the title, description, and badges, so it renders below the badges and above the actions column.

   ```tsx
   <div style={{ marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.375rem" }}>
     {task.subtasks.length > 0 && (
       <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
         {task.subtasks.filter((s) => s.done).length} of {task.subtasks.length} done
       </div>
     )}
     {task.subtasks.map((sub) => (
       <div key={sub.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
         <button
           onClick={() => handleToggleSubtask(task, sub.id)}
           title={sub.done ? "Mark subtask not done" : "Mark subtask done"}
           style={{
             flexShrink: 0,
             width: 16,
             height: 16,
             borderRadius: "50%",
             border: `2px solid ${sub.done ? "var(--accent-gold)" : "var(--border-hover)"}`,
             background: sub.done ? "var(--accent-gold)" : "transparent",
             color: sub.done ? "#0c1524" : "transparent",
             cursor: "pointer",
             display: "flex",
             alignItems: "center",
             justifyContent: "center",
             fontSize: "0.6rem",
             fontWeight: 700,
             padding: 0,
           }}
         >
           {sub.done ? "✓" : ""}
         </button>
         <span
           style={{
             flex: 1,
             fontSize: "0.8125rem",
             color: sub.done ? "var(--text-muted)" : "var(--text-primary)",
             textDecoration: sub.done ? "line-through" : "none",
             overflow: "hidden",
             textOverflow: "ellipsis",
             whiteSpace: "nowrap",
           }}
         >
           {sub.title}
         </span>
         <button
           className="btn btn-ghost btn-sm"
           onClick={() => handleDeleteSubtask(task, sub.id)}
           title="Delete subtask"
           style={{ padding: "0.125rem 0.5rem" }}
         >
           ×
         </button>
       </div>
     ))}
     <div style={{ display: "flex", gap: "0.375rem", marginTop: "0.125rem" }}>
       <input
         className="input"
         type="text"
         placeholder="Add subtask…"
         value={subtaskDrafts[task.id] ?? ""}
         onChange={(e) =>
           setSubtaskDrafts((prev) => ({ ...prev, [task.id]: e.target.value }))
         }
         onKeyDown={(e) => {
           if (e.key === "Enter") {
             handleAddSubtask(task, subtaskDrafts[task.id] ?? "");
           }
         }}
         style={{ flex: 1, fontSize: "0.8125rem", padding: "0.375rem 0.625rem" }}
       />
       <button
         className="btn btn-ghost btn-sm"
         onClick={() => handleAddSubtask(task, subtaskDrafts[task.id] ?? "")}
       >
         + Add
       </button>
     </div>
   </div>
   ```

   Layout notes:
   - The "add subtask" input row is always visible (even when the list is empty); the counter line and the per-subtask rows render only when subtasks exist.
   - All classes (`btn`, `btn-ghost`, `btn-sm`, `input`) and CSS tokens (`--text-muted`, `--text-primary`, `--accent-gold`, `--border-hover`) already exist in the project. Inline styles match the surrounding `page.tsx` convention.

**Verification** (feature task — modifies production behavior. The project's testing strategy names only the type-check, lint, and manual-smoke layers; manual smoke is the only behavioral check, so it serves as the failing test → passing test loop):

1. Failing-test stand-in: before this task's edits, the type check passes (Task 4 left it clean) but the dev server does not render any subtask UI and `handleAddSubtask`/`handleToggleSubtask`/`handleDeleteSubtask` do not exist. This is the "expected absence of behavior" baseline.
2. Apply this task's edits.
3. Run `pnpm exec tsc`. **Expected:** clean.
4. Run `pnpm lint`. **Expected:** clean.
5. Run `pnpm dev`. Open `http://localhost:3000`. Walk through the spec's eight-step manual smoke (reproduced here for the implementer's convenience):
   1. App loads; existing tasks show no subtask block (or just the "Add subtask…" input row) and no counter.
   2. Add a subtask to an existing task. Hard-refresh the browser; subtask is still there.
   3. Toggle a subtask done, then undone. Counter updates. Parent status is unaffected (no auto-promotion).
   4. Mark all subtasks done; click parent status toggle from `in-progress`. Parent advances to `done`.
   5. With at least one subtask open and parent at `in-progress`, click parent toggle. Parent lands on `todo` (not `done`). Tooltip on the parent toggle reads "Status: In Progress — complete all subtasks to mark done" before the click.
   6. Set parent to `done` (all subtasks done), then add a new not-done subtask. Parent downgrades to `in-progress` and `completedAt` clears (no green "Done" badge).
   7. Delete a subtask. Counter and rollup update.
   8. Reload the browser. All state survives.

**Commit message** (verbatim):

```
feat(page): render subtask UI and add/toggle/delete handlers per task
```

---

## Out of scope (do not implement)

The spec's non-goals are reproduced here so the implementer does not add them:

- Subtasks of subtasks (nesting deeper than one level).
- Editing subtask text after creation.
- Reordering, drag-and-drop, or bulk actions on subtasks.
- Per-subtask metadata (priority, due date, category, description).
- Filtering, searching, or sorting the task list by subtask state.
- Auto-promoting the parent to `done` when the last subtask is toggled done.

If any of these feel necessary while implementing, stop and re-read the spec rather than adding them.

## Data invariants (post-condition for every persisted write)

After every persisted write the following must hold for every row:

1. `Array.isArray(task.subtasks)` is true.
2. If `task.status === "done"` then `allSubtasksDone(task)` is true.
3. Every `Subtask.id` is unique within its parent's `subtasks` array.

Invariant 1 is enforced by Task 1 (required field) + Task 2 (migration). Invariant 2 is enforced by routing every status change through `clampParentStatus` (subtask mutators, Task 5) or `nextStatusForCycle` (parent toggle, Task 4). Invariant 3 is upheld by `Date.now().toString()` since subtask creations are user-driven and serial within a card.
