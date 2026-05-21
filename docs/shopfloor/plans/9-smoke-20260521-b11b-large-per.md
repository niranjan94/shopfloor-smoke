# Plan: per-task subtasks with rollup

Issue: [#9](https://github.com/niranjan94/shopfloor-smoke/issues/9) — smoke-20260521-b11b/large
Spec: [`docs/shopfloor/specs/9-smoke-20260521-b11b-large-per.md`](../specs/9-smoke-20260521-b11b-large-per.md)

## Testing strategy

Reproduced verbatim from the spec. This project explicitly opts out of automated tests (`CLAUDE.md`: "No tests: this is a smoke test target, not a tested app. There is no test suite."). There is no `test/`, `tests/`, `spec/`, `__tests__/`, or `e2e/` directory and `package.json` exposes no test script. Introducing a test layer here would violate the project's stated policy and is out of scope.

The layers that DO apply are static checks and manual smoke:

- **Type check** — `pnpm exec tsc` (per `CLAUDE.md`). Must pass with the new `Subtask` interface and the required `subtasks` field on `Task`.
- **Lint** — `pnpm lint` (per `CLAUDE.md`, runs `eslint`). Must pass.
- **Build** — `pnpm build`. Must succeed; surfaces production-only issues the dev server can hide.
- **Manual smoke via `pnpm dev`** — exercise on `http://localhost:3000`:
  1. Add a task, add three subtasks, toggle two done, verify parent stays in `in-progress` after a `cycleStatus` click that would normally land on `done`.
  2. Toggle the third subtask done, click the parent's status button, verify the parent now lands on `done`.
  3. Toggle one of the done subtasks back; verify the parent demotes to `in-progress` and the strike-through clears.
  4. Reload the page and confirm subtasks persist.
  5. To exercise the migration, run the app once on `main` to create v1 rows, then run on the feature branch and confirm the existing tasks load with `subtasks: []` and no console errors.
  6. Delete a `done` subtask while the parent is `done` — verify the parent demotes when this leaves a non-empty unfinished set, and stays `done` only if every remaining subtask is still done.

Because no test layer exists, every feature task in this plan invokes the **TDD exception for non-feature tasks**: steps 1–4 of the TDD shape are skipped (no failing test to write); steps verify via `pnpm exec tsc` and `pnpm lint` at the file scope and a final task runs the full smoke pass.

## Task list overview

| # | Task | Files | Commit type |
|---|------|-------|-------------|
| 1 | Add `Subtask` type and required `subtasks` field on `Task` | `app/types.ts` | `feat` |
| 2 | Bump IndexedDB to v2 with cursor-walk backfill | `app/db.ts` | `feat` |
| 3 | Backfill `subtasks: []` on newly created tasks in the home page | `app/page.tsx` | `feat` |
| 4 | Add subtask handlers and rollup rule in `cycleStatus` | `app/page.tsx` | `feat` |
| 5 | Add inline `SubtaskList` component and render it in each task card | `app/page.tsx` | `feat` |
| 6 | Verification — type check, lint, build, manual smoke | (none) | n/a |

---

## Task 1 — Add `Subtask` type and required `subtasks` field on `Task`

**Affected files**
- Modify: `app/types.ts`

**TDD exception:** no test layer exists. Verify with `pnpm exec tsc`.

**Steps**

1. Open `app/types.ts`. After the existing `Task` interface (lines 1–12) and before the `Category` interface, add a new `Subtask` interface:

   ```ts
   export interface Subtask {
     id: string;
     title: string;
     done: boolean;
     createdAt: string;
   }
   ```

2. In the existing `Task` interface, add `subtasks: Subtask[];` as the last field (after `completedAt?: string;`). The field is **required**, not optional — every `Task` construction site must provide it. The final shape:

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
     subtasks: Subtask[];
   }
   ```

3. Run `pnpm exec tsc`. Expect the type check to **fail** at this point because `app/page.tsx` constructs a `Task` literal in `handleSave` (lines 71–82) without a `subtasks` field. This is the expected failure — Task 3 fixes the construction site. Do not modify `page.tsx` in this task.

4. Commit:

   ```
   feat(types): add Subtask interface and required subtasks field on Task
   ```

---

## Task 2 — Bump IndexedDB to v2 with cursor-walk backfill

**Affected files**
- Modify: `app/db.ts`

**TDD exception:** no test layer exists. Verify with `pnpm exec tsc` and `pnpm lint`; the migration is exercised in Task 6's manual smoke step 5.

**Steps**

1. Open `app/db.ts`. Change line 4 from:

   ```ts
   const DB_VERSION = 1;
   ```

   to:

   ```ts
   const DB_VERSION = 2;
   ```

2. Update the import on line 1 to include the new `Subtask` type:

   ```ts
   import { Task, Category, Subtask } from "./types";
   ```

3. Extend the `onupgradeneeded` handler (currently lines 25–37). Keep the existing v1 store-creation block exactly as-is, then add a v1 → v2 branch that walks the `tasks` store and backfills `subtasks: []` on rows that lack it. The final handler body:

   ```ts
   request.onupgradeneeded = (event) => {
     const db = (event.target as IDBOpenDBRequest).result;
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
   };
   ```

   Implementation notes (from spec §"Storage migration"):
   - The upgrade uses the version-change transaction implicit on the open request (`event.target.transaction`), **not** a fresh `database.transaction(...)` call — opening a new transaction inside `onupgradeneeded` would fail.
   - The cursor walk is idempotent: `Array.isArray(row.subtasks)` guards re-runs and fresh installs.
   - On a fresh install `event.oldVersion === 0`, so the branch fires but the store is empty and the cursor terminates immediately.
   - No new indexes on `subtasks`; the UI iterates the array in memory.

4. Do **not** change any of the public `db.*` methods (`addTask`, `updateTask`, `getTasks`, `getTaskById`, `getTasksByCategory`, `deleteTask`, `addCategory`, `getCategories`). They keep their existing signatures; `Task.subtasks` rides along inside the stored object and IndexedDB serialises it transparently.

5. Run `pnpm exec tsc` and `pnpm lint`. Both must pass for this file. (The full project type check will still fail because of the unresolved `app/page.tsx` construction site from Task 1 — that's expected; do not address it here.)

6. Commit:

   ```
   feat(db): migrate IndexedDB to v2 with subtasks backfill
   ```

---

## Task 3 — Backfill `subtasks: []` on newly created tasks in the home page

**Affected files**
- Modify: `app/page.tsx`

**TDD exception:** no test layer exists. This is the minimum change to make the `Task` literal in `handleSave` satisfy the now-required `subtasks` field added in Task 1.

**Steps**

1. Open `app/page.tsx`. Update the import on line 4 from:

   ```ts
   import { Task, Category } from "./types";
   ```

   to:

   ```ts
   import { Task, Category, Subtask } from "./types";
   ```

   (`Subtask` is needed by Tasks 4 and 5; introducing it now avoids a churning import line.)

2. In `handleSave` (currently lines 67–93), modify the `task` literal so it preserves the existing task's `subtasks` when editing and defaults to `[]` when creating. Replace lines 71–82 with:

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

   Rationale: `handleSave` is the only place in this file that constructs a `Task` from scratch. Backfilling here keeps the form path consistent with the v2 storage shape. Existing tasks that arrive from `db.getTasks()` already have `subtasks` because of the Task 2 migration, so no further reader-side defaulting is needed.

3. Run `pnpm exec tsc`. It must now pass for the whole project (Task 1's failing construction site is resolved).

4. Run `pnpm lint`. Must pass.

5. Commit:

   ```
   feat(home): backfill subtasks on task creation and edit
   ```

---

## Task 4 — Add subtask handlers and rollup rule in `cycleStatus`

**Affected files**
- Modify: `app/page.tsx`

**TDD exception:** no test layer exists. Verify with `pnpm exec tsc` and `pnpm lint`; behavior is exercised in Task 6's manual smoke.

**Steps**

1. Open `app/page.tsx`. Above `cycleStatus` (currently at line 116), add a pure helper:

   ```ts
   function canMarkDone(task: Task): boolean {
     return task.subtasks.length > 0 && task.subtasks.every((s) => s.done);
   }
   ```

   Place `canMarkDone` as a top-level function (outside the `Home` component, alongside `priorityClass` / `statusBadgeClass` / `statusLabel`).

2. Replace the body of `cycleStatus` (currently lines 116–128). The new implementation enforces the rollup cap: from `in-progress`, a task with at least one subtask can only advance to `done` when every subtask is `done`; otherwise it wraps back to `todo`. Zero-subtask tasks keep the existing three-state cycle.

   ```ts
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
     const now = new Date().toISOString();
     const updated: Task = {
       ...task,
       status: nextStatus,
       completedAt: nextStatus === "done" ? now : undefined,
       updatedAt: now,
     };
     try {
       await db.updateTask(updated);
       setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
     } catch (e) {
       console.error(e);
     }
   }
   ```

3. Inside the `Home` component, alongside `cycleStatus` / `handleSave` / `handleDelete`, add three handlers. Place them immediately after `cycleStatus`:

   ```ts
   async function addSubtask(taskId: string, rawTitle: string): Promise<void> {
     const title = rawTitle.trim();
     if (!title) return;
     const parent = tasks.find((t) => t.id === taskId);
     if (!parent) return;
     const now = new Date().toISOString();
     const newSubtask: Subtask = {
       id: Date.now().toString(),
       title,
       done: false,
       createdAt: now,
     };
     const updated: Task = {
       ...parent,
       subtasks: [...parent.subtasks, newSubtask],
       updatedAt: now,
     };
     try {
       await db.updateTask(updated);
       setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
     } catch (e) {
       console.error(e);
     }
   }

   async function toggleSubtask(taskId: string, subtaskId: string): Promise<void> {
     const parent = tasks.find((t) => t.id === taskId);
     if (!parent) return;
     const nextSubtasks = parent.subtasks.map((s) =>
       s.id === subtaskId ? { ...s, done: !s.done } : s,
     );
     const now = new Date().toISOString();
     const allDone = nextSubtasks.length > 0 && nextSubtasks.every((s) => s.done);
     const demote = parent.status === "done" && !allDone;
     const updated: Task = {
       ...parent,
       subtasks: nextSubtasks,
       status: demote ? "in-progress" : parent.status,
       completedAt: demote ? undefined : parent.completedAt,
       updatedAt: now,
     };
     try {
       await db.updateTask(updated);
       setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
     } catch (e) {
       console.error(e);
     }
   }

   async function deleteSubtask(taskId: string, subtaskId: string): Promise<void> {
     const parent = tasks.find((t) => t.id === taskId);
     if (!parent) return;
     const nextSubtasks = parent.subtasks.filter((s) => s.id !== subtaskId);
     const now = new Date().toISOString();
     const allDone = nextSubtasks.length > 0 && nextSubtasks.every((s) => s.done);
     const demote = parent.status === "done" && nextSubtasks.length > 0 && !allDone;
     const updated: Task = {
       ...parent,
       subtasks: nextSubtasks,
       status: demote ? "in-progress" : parent.status,
       completedAt: demote ? undefined : parent.completedAt,
       updatedAt: now,
     };
     try {
       await db.updateTask(updated);
       setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
     } catch (e) {
       console.error(e);
     }
   }
   ```

   Notes from spec §"Rollup rule":
   - Auto-promotion of the parent is **not** implemented: toggling a subtask never advances the parent to `done`. `cycleStatus` is the only path that promotes.
   - Auto-demotion runs from `toggleSubtask` and `deleteSubtask`. When the parent is currently `done` and the resulting subtask set is non-empty but not fully done, demote to `in-progress` and clear `completedAt`. If `deleteSubtask` empties the list, leave the parent's status untouched (an empty list re-enables the unconstrained three-state cycle for future `cycleStatus` clicks, but does not retroactively demote a parent that was already `done`).

4. Update the status-button `title` (currently line 299) to surface the rollup cap when it is blocking. Replace:

   ```tsx
   title={`Status: ${statusLabel(task.status)} — click to advance`}
   ```

   with:

   ```tsx
   title={
     task.status === "in-progress" && task.subtasks.length > 0 && !canMarkDone(task)
       ? `Status: ${statusLabel(task.status)} — finish subtasks to mark done`
       : `Status: ${statusLabel(task.status)} — click to advance`
   }
   ```

5. Run `pnpm exec tsc` and `pnpm lint`. Both must pass. (`addSubtask`, `toggleSubtask`, `deleteSubtask` are unused at this point — Task 5 wires them in. If the lint config flags unused locals as an error and blocks this step, prefix them with `void` calls inside Task 5; otherwise expect `pnpm lint` to pass with at most warnings. Do not silence with `// eslint-disable` — if a real error fires, finish Task 5 in the same commit instead.)

6. Commit:

   ```
   feat(home): add subtask handlers and rollup-gated cycleStatus
   ```

---

## Task 5 — Add inline `SubtaskList` component and render it in each task card

**Affected files**
- Modify: `app/page.tsx`

**TDD exception:** no test layer exists. Verify with `pnpm exec tsc`, `pnpm lint`, and Task 6's manual smoke.

**Steps**

1. Open `app/page.tsx`. Below the existing top-level helpers (`priorityClass`, `statusBadgeClass`, `statusLabel`, `canMarkDone`) and above `export default function Home()`, add the `SubtaskList` component. It is inline by spec decision (see §"Trade-offs" — used in one place; splitting into `app/components/` was rejected as YAGNI).

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
   }) {
     const [draft, setDraft] = useState("");

     function submit() {
       const title = draft.trim();
       if (!title) return;
       onAdd(title);
       setDraft("");
     }

     return (
       <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", marginTop: "0.75rem" }}>
         {task.subtasks.map((s) => (
           <div
             key={s.id}
             style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
           >
             <button
               onClick={() => onToggle(s.id)}
               title={s.done ? "Mark not done" : "Mark done"}
               style={{
                 flexShrink: 0,
                 width: 16,
                 height: 16,
                 borderRadius: "50%",
                 border: `2px solid ${s.done ? "var(--accent-gold)" : "var(--border-hover)"}`,
                 background: s.done ? "var(--accent-gold)" : "transparent",
                 color: s.done ? "#0c1524" : "transparent",
                 cursor: "pointer",
                 display: "flex",
                 alignItems: "center",
                 justifyContent: "center",
                 fontSize: "0.6rem",
                 fontWeight: 700,
                 transition: "all 150ms ease",
               }}
             >
               {s.done ? "✓" : ""}
             </button>
             <span
               style={{
                 flex: 1,
                 minWidth: 0,
                 fontSize: "0.8125rem",
                 color: s.done ? "var(--text-muted)" : "var(--text-primary)",
                 textDecoration: s.done ? "line-through" : "none",
                 overflow: "hidden",
                 textOverflow: "ellipsis",
                 whiteSpace: "nowrap",
               }}
             >
               {s.title}
             </span>
             <button
               className="btn btn-ghost btn-sm"
               onClick={() => onDelete(s.id)}
             >
               Delete
             </button>
           </div>
         ))}
         <div style={{ display: "flex", gap: "0.375rem" }}>
           <input
             className="input"
             type="text"
             placeholder="Add subtask…"
             value={draft}
             onChange={(e) => setDraft(e.target.value)}
             onKeyDown={(e) => e.key === "Enter" && submit()}
             style={{ flex: 1, fontSize: "0.8125rem" }}
           />
           <button className="btn btn-muted btn-sm" onClick={submit}>
             Add
           </button>
         </div>
       </div>
     );
   }
   ```

   Spec constraints honored:
   - Empty / whitespace-only titles are ignored (mirrors `handleSave`).
   - When `task.subtasks.length === 0`, only the input row renders — no empty-state copy.
   - The toggle button re-uses the visual treatment of the parent status button (circle, gold-on-done, transparent-on-todo) but in a smaller 16×16 size and with only checked/empty states (no `in-progress` because `Subtask.done` is boolean).

2. Render `<SubtaskList />` inside each task card. Locate the content `<div>` opened on line 322 (`<div style={{ flex: 1, minWidth: 0 }}>`). Immediately after the closing `</div>` of the badge row (the `<div>` that contains `<span className="badge badge-category">…`; this closes around line 354 with `)}` and then `</div>`), and before that content `<div>` closes (line 355), insert:

   ```tsx
   <SubtaskList
     task={task}
     onAdd={(title) => addSubtask(task.id, title)}
     onToggle={(subtaskId) => toggleSubtask(task.id, subtaskId)}
     onDelete={(subtaskId) => deleteSubtask(task.id, subtaskId)}
   />
   ```

   Placement check: `SubtaskList` sits **below** the badge row (`category`, `status`, `priority`, `dueDate`) and **inside** the content column (`flex: 1`), so the existing top-row layout (status button, content, action buttons) is unchanged. The card grows downward as subtasks are added.

3. Run `pnpm exec tsc` and `pnpm lint`. Both must pass with no warnings about unused symbols (`addSubtask` / `toggleSubtask` / `deleteSubtask` / `canMarkDone` / `Subtask` are all now reachable).

4. Commit:

   ```
   feat(home): render inline SubtaskList under each task card
   ```

---

## Task 6 — Verification: type check, lint, build, manual smoke

**Affected files**
- None (verification only).

**TDD exception:** this is the manual-smoke layer the testing strategy names; it is not a feature task.

**Steps**

1. Run `pnpm exec tsc`. Must exit 0.
2. Run `pnpm lint`. Must exit 0.
3. Run `pnpm build`. Must exit 0.
4. Run `pnpm dev` and exercise the six manual-smoke scenarios from the [Testing strategy](#testing-strategy) section on `http://localhost:3000`:
   1. Add a task → add three subtasks → toggle two done → click the parent status button (cycle from `in-progress`) → parent must stay capped (advances to `todo`, not `done`).
   2. Toggle the third subtask done → click the parent status button → parent must land on `done`.
   3. Toggle a `done` subtask back → parent must demote to `in-progress`, strike-through clears.
   4. Reload the page → subtasks persist.
   5. Open the app once on `main` (creates v1 rows), switch to this branch, reload → existing tasks load with `subtasks: []` and no console errors.
   6. With parent `done` and all subtasks `done`, delete one `done` subtask → if the remaining set is non-empty and not fully done, parent demotes to `in-progress`; otherwise (still all done, or empty after deletion) parent stays `done`.
5. If any scenario fails, do **not** commit. Diagnose and fix the root cause in the appropriate earlier task's scope; re-run steps 1–4 of this task before committing.
6. No commit for this task (verification is intentionally unmessaged; the prior five commits are the diff). If the implementer's workflow requires a sentinel commit at the end, use:

   ```
   chore(home): verify subtasks feature via type check, lint, build, and manual smoke
   ```

   Otherwise this task ends silently.

---

## Self-review

- **Completeness** — `## Testing strategy` reproduces the spec verbatim. Every task lists affected files, exact code, commands, expected outputs, and a Conventional Commits commit message. No `TBD`/`???`/`as appropriate`. ✅
- **Spec alignment** — Each spec decision maps to a task: §"Data model" → Task 1; §"Storage migration" → Task 2; §"UI/handlers/rollup" → Tasks 3+4; §"Subtask list component" → Task 5; §"Testing strategy" → Task 6. The cap-only-with-auto-demote rule, the `Subtask.done` boolean, the inline component decision, and the required (non-optional) `subtasks` field are all honored. ✅
- **Task decomposition** — Six atomic tasks; each declares files and runs commands a fresh implementer subagent can execute. Tasks 4 and 5 both modify `app/page.tsx` but for distinct concerns (logic vs. UI render) and the split keeps each diff under ~80 lines. ✅
- **Buildability** — A senior engineer who has not read the spec can implement each task from this plan alone: types are spelled out, the migration code is given as a complete block, every handler is given as a complete block, the JSX insertion point is named by line number and surrounding markers, and Conventional Commits messages are quoted verbatim. ✅
- **Red-flag re-scan** — No `should`/`probably`/`try to`/`as appropriate`. No deferred work without a named follow-up. Type names (`Subtask`, `Task`), method names (`addSubtask`, `toggleSubtask`, `deleteSubtask`, `canMarkDone`), and file paths are consistent across tasks. Every verification step uses one of the four layers named in the testing strategy. ✅
