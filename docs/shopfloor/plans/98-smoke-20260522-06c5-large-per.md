# Plan — Per-task subtasks with completion rollup

Issue: [#98](../../../issues/98) — smoke-20260522-06c5/large
Spec: [`docs/shopfloor/specs/98-smoke-20260522-06c5-large-per.md`](../specs/98-smoke-20260522-06c5-large-per.md)

## Testing strategy

Reproduced verbatim from the spec's `## Testing strategy` section. This project has no automated test suite (`CLAUDE.md`: *"No tests: this is a smoke test target, not a tested app. There is no test suite."*). `package.json` defines only `dev`, `build`, `start`, and `lint`. The applicable verification layers for every feature task in this plan are:

- **Type check — `pnpm exec tsc`.** Primary correctness gate.
- **Lint — `pnpm lint`.** Catches unused variables and React hook misuse.
- **Production build — `pnpm build`.** Confirms Next.js production compile.
- **Manual smoke in `pnpm dev`.** Run at the end of the plan only (Task 7) — the implementer must not start a dev server mid-plan. Required by `CLAUDE.md`'s standard workflow for UI changes.

**No new test layer is introduced.** Unit / integration / e2e / snapshot tests are explicitly not applicable per the spec and are not added.

Because there is no failing-test-first layer available, every feature task in this plan uses the following shape in place of the canonical 5-step TDD shape:

1. Make the change described under **Implementation**.
2. Run `pnpm exec tsc` from the repo root; confirm zero errors. Fix any reported error before continuing.
3. Run `pnpm lint`; confirm zero errors. Fix any reported error before continuing.
4. Stage only the files declared under **Affected files** for this task and commit with the Conventional Commits message in the task header.

The production build (`pnpm build`) and manual smoke run only once, at the end, in Task 7. This keeps per-task cost low while still gating every commit on type-check + lint.

## Task 1 — Add `Subtask` interface and required `subtasks` field; backfill `handleSave`

**Affected files**

- Modify: `app/types.ts`
- Modify: `app/page.tsx`

**Why both files in one task.** Making `subtasks: Subtask[]` required on `Task` (the spec's explicit decision; see *Trade-offs → Required `subtasks: []` vs. optional*) breaks compilation at the one site that currently constructs a `Task` literal: `handleSave` in `app/page.tsx` (lines 71–82). The two edits must land together to keep `pnpm exec tsc` green. No other behavior changes here.

**Implementation**

1. In `app/types.ts`, add a new `Subtask` interface above `Task` and add a required `subtasks: Subtask[]` field on `Task`:

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
   ```

   `Category` is unchanged.

2. In `app/page.tsx`, inside `handleSave` (currently lines 67–93), set `subtasks` on the constructed `Task`. The literal becomes:

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

   No other edits in this file in this task.

**Verification**

- `pnpm exec tsc` — zero errors. (Confirms every `Task` construction site supplies `subtasks` and the `Subtask` shape compiles.)
- `pnpm lint` — zero errors.

**Commit**

`feat(types): add required subtasks field on Task`

## Task 2 — Bump IndexedDB to v2 with cursor-based backfill

**Affected files**

- Modify: `app/db.ts`

**Implementation**

1. In `app/db.ts`, change line 4 from `const DB_VERSION = 1;` to `const DB_VERSION = 2;`.

2. Replace the existing `request.onupgradeneeded` handler (lines 25–37) with one that reads `event.oldVersion`, retains the existing v1 store-creation branch unchanged, and adds a `oldVersion < 2` branch that opens a cursor on the version-change transaction provided by `event.target.transaction` and writes `subtasks: []` on any row missing the field. The full handler:

   ```ts
   request.onupgradeneeded = (event) => {
     const db = (event.target as IDBOpenDBRequest).result;
     const tx = (event.target as IDBOpenDBRequest).transaction!;
     const oldVersion = event.oldVersion;

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

   Notes:
   - Do NOT open a new transaction inside `onupgradeneeded`; the version-change transaction is supplied by `event.target.transaction` and is the only valid handle while upgrading.
   - The existing v1 branch (`!db.objectStoreNames.contains(TASKS_STORE)`) must remain untouched so a fresh install still creates the schema in one pass.
   - No new object store, no new index — subtasks live embedded on the `Task` row per the spec's *Persistence* section.

3. The `Task` import on line 1 is already present; reuse it. The five `db.*` methods (lines 41–129) are unchanged in this task.

**Verification**

- `pnpm exec tsc` — zero errors.
- `pnpm lint` — zero errors.

**Commit**

`feat(db): bump TodoApp to v2 and backfill subtasks on upgrade`

## Task 3 — Add `canBeDone` helper and gate `cycleStatus` on subtask completion

**Affected files**

- Modify: `app/page.tsx`

**Implementation**

1. Above the `Home` component (after the existing `statusLabel` function on line 31), add the helper exactly as the spec specifies:

   ```ts
   function canBeDone(task: Task): boolean {
     return task.subtasks.length === 0 || task.subtasks.every((s) => s.done);
   }
   ```

2. Rewrite `cycleStatus` (currently lines 116–128) so the `in-progress → done` transition is gated. The next status is computed inline rather than via a fixed map:

   ```ts
   async function cycleStatus(task: Task) {
     let nextStatus: Task["status"];
     if (task.status === "todo") nextStatus = "in-progress";
     else if (task.status === "in-progress") nextStatus = canBeDone(task) ? "done" : "todo";
     else nextStatus = "todo";

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
     } catch (e) { console.error(e); }
   }
   ```

   Per the spec's *Rollup rule*: when a parent has unfinished subtasks and the user advances from `in-progress`, the next status is `todo` (skipping `done`).

3. No UI change in this task — Task 6 wires the tooltip and Task 5 renders subtasks. This task is logic-only.

**Verification**

- `pnpm exec tsc` — zero errors.
- `pnpm lint` — zero errors.

**Commit**

`feat(page): gate status cycle on subtask completion`

## Task 4 — Add `subtaskDrafts` state and add/toggle/delete handlers

**Affected files**

- Modify: `app/page.tsx`

**Implementation**

1. Inside `Home`, after the existing `const [loading, setLoading] = useState(true);` on line 47, add one new state hook:

   ```ts
   const [subtaskDrafts, setSubtaskDrafts] = useState<Record<string, string>>({});
   ```

2. Update the `Subtask` import on line 4 of `app/page.tsx`:

   ```ts
   import { Task, Subtask, Category } from "./types";
   ```

3. Add three async handlers immediately after `cycleStatus` (i.e. after the closing brace of `cycleStatus`, before the `const filtered = ...` line). Each routes through the existing `db.updateTask` per the spec's *Subtask operations* section and reuses the optimistic-update pattern.

   ```ts
   async function addSubtask(parent: Task, title: string) {
     const trimmed = title.trim();
     if (!trimmed) return;
     const now = new Date().toISOString();
     const newSub: Subtask = {
       id: crypto.randomUUID(),
       title: trimmed,
       done: false,
       createdAt: now,
     };
     const updated: Task = {
       ...parent,
       subtasks: [...parent.subtasks, newSub],
       updatedAt: now,
     };
     try {
       await db.updateTask(updated);
       setTasks((prev) => prev.map((t) => (t.id === parent.id ? updated : t)));
       setSubtaskDrafts((prev) => ({ ...prev, [parent.id]: "" }));
     } catch (e) { console.error(e); }
   }

   async function toggleSubtask(parent: Task, subtaskId: string) {
     const now = new Date().toISOString();
     const nextSubtasks = parent.subtasks.map((s) =>
       s.id === subtaskId ? { ...s, done: !s.done } : s
     );
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
       setTasks((prev) => prev.map((t) => (t.id === parent.id ? updated : t)));
     } catch (e) { console.error(e); }
   }

   async function deleteSubtask(parent: Task, subtaskId: string) {
     const now = new Date().toISOString();
     const updated: Task = {
       ...parent,
       subtasks: parent.subtasks.filter((s) => s.id !== subtaskId),
       updatedAt: now,
     };
     try {
       await db.updateTask(updated);
       setTasks((prev) => prev.map((t) => (t.id === parent.id ? updated : t)));
     } catch (e) { console.error(e); }
   }
   ```

   Contract notes (matching the spec):
   - `addSubtask`: empty/whitespace title is a no-op; clears the draft on success.
   - `toggleSubtask`: demotes the parent from `done` → `in-progress` (clearing `completedAt`) only when the toggle leaves at least one subtask incomplete on what was a `done` parent. Does NOT auto-promote.
   - `deleteSubtask`: no status side-effect. Removing the last incomplete subtask does not auto-promote.

4. No JSX is added in this task — the handlers are wired up in Task 5. They are reachable from the closure; ESLint should not warn about unused functions because TypeScript will still see them as defined, but if `eslint-config-next` flags them, leave them as-is (they will become referenced in Task 5). Do not silence the warning with disables.

**Verification**

- `pnpm exec tsc` — zero errors.
- `pnpm lint` — may report `@typescript-eslint/no-unused-vars` on the three new handlers and on `subtaskDrafts`/`setSubtaskDrafts` since Task 5 has not landed yet. If, and only if, the lint warnings are exactly these "declared but never used" warnings on the symbols introduced in this task, the implementer may proceed to Task 5 without a separate fix. Any other lint error must be fixed before committing. Document the deferred-use warnings in the commit message body if they appear.

**Commit**

`feat(page): add subtask state and add/toggle/delete handlers`

## Task 5 — Render the subtask list inline under each task card

**Affected files**

- Modify: `app/page.tsx`

**Implementation**

1. Inside the task-card render loop (`filtered.map((task, idx) => ...)`, currently starting at line 289), the card's outer `<div className={priorityClass(...)}>` has one child: a flex row containing the status toggle, the content column, and the actions column (lines 295–366). Append a subtasks block as a sibling of that flex row (i.e. as the second child of the outer `<div>`), after the closing `</div>` on line 366 and before the outer `</div>` on line 367.

2. The subtasks block — inline JSX, no new component file, per the spec's *UI — task card* section:

   ```tsx
   <div style={{ marginTop: "0.75rem", paddingLeft: "calc(22px + 0.875rem)" }}>
     {(() => {
       const total = task.subtasks.length;
       const done = task.subtasks.filter((s) => s.done).length;
       return total > 0 ? (
         <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.375rem" }}>
           Subtasks ({done} done / {total} total)
         </div>
       ) : null;
     })()}

     {task.subtasks.map((s) => (
       <div
         key={s.id}
         style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}
       >
         <input
           type="checkbox"
           checked={s.done}
           onChange={() => toggleSubtask(task, s.id)}
         />
         <span
           style={{
             flex: 1,
             fontSize: "0.8125rem",
             color: s.done ? "var(--text-muted)" : "var(--text-primary)",
             textDecoration: s.done ? "line-through" : "none",
           }}
         >
           {s.title}
         </span>
         <button
           className="btn btn-ghost btn-sm"
           onClick={() => deleteSubtask(task, s.id)}
           aria-label="Delete subtask"
         >
           ×
         </button>
       </div>
     ))}

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
           addSubtask(task, subtaskDrafts[task.id] ?? "");
         }
       }}
       style={{ marginTop: "0.375rem", fontSize: "0.8125rem" }}
     />
   </div>
   ```

   Spec compliance notes:
   - The "Subtasks (n done / m total)" header is hidden when `total === 0`; the add input is still shown — matches the spec's "Hidden when both n and m are zero, but the add input is still shown so users can start adding."
   - Uses the existing `input` and `btn btn-ghost btn-sm` classes; the only inline styles are spacing/typography that mirror the rest of the page. No new CSS files, no new Tailwind classes, no new CSS variables.
   - The `paddingLeft: "calc(22px + 0.875rem)"` aligns the subtask block under the task title (skipping the 22px status-toggle circle plus the 0.875rem gap from the parent flex row).

3. Do not refactor the existing card layout. Do not extract a component. The page is one large component by convention; preserve that.

**Verification**

- `pnpm exec tsc` — zero errors.
- `pnpm lint` — zero errors (including the previously deferred unused-handler warnings from Task 4, which now reference real call sites).

**Commit**

`feat(page): render inline subtask list under each task card`

## Task 6 — Extend status-button tooltip when subtasks gate the cycle

**Affected files**

- Modify: `app/page.tsx`

**Implementation**

1. In the status-toggle `<button>` inside the task-card render loop (currently the `title={...}` prop on line 299), change the `title` value from

   ```tsx
   title={`Status: ${statusLabel(task.status)} — click to advance`}
   ```

   to

   ```tsx
   title={
     canBeDone(task)
       ? `Status: ${statusLabel(task.status)} — click to advance`
       : `Status: ${statusLabel(task.status)} — complete all subtasks to mark done`
   }
   ```

   Per the spec's *Status-toggle tooltip* section: this is the only affordance hinting that the cycle is gated. Do not add a disabled state, do not change the button's color, do not change its border.

2. No other changes in this task.

**Verification**

- `pnpm exec tsc` — zero errors.
- `pnpm lint` — zero errors.

**Commit**

`feat(page): extend status tooltip when subtasks gate done`

## Task 7 — Final verification: production build and manual smoke

**Non-feature task** (verification only — no production code changes). The TDD-shape steps 1–4 do not apply; this task exists to run the gates the per-task shape deferred.

**Affected files**

- (none modified)

**Implementation**

1. Run `pnpm build` from the repo root. Confirm a successful production build with no type or lint errors. If the build fails, return to the failing task, fix the root cause (do not bypass with `// @ts-ignore`, `eslint-disable`, or `--no-verify`), and re-run.

2. Start the dev server with `pnpm dev` and exercise every scenario the spec's *Testing strategy* names. Each item below must be checked manually in the browser; if any fails, return to the relevant task and fix the root cause.

   - (a) **No-subtask parity.** Create a task with no subtasks. Confirm the card renders and the status cycle behaves exactly as before (`todo → in-progress → done → todo`). Confirm the "Subtasks (… done / … total)" header is hidden but the "Add subtask…" input is visible.
   - (b) **Persistence across reload.** On an existing task, add two subtasks, toggle one to done, delete one. Reload the page (full browser reload, not React fast-refresh). Confirm the remaining subtask and its state survive.
   - (c) **Gated cycle.** On a task with one incomplete subtask, click the status circle three times. Confirm the sequence is `todo → in-progress → todo` (NOT `→ done`).
   - (d) **Auto-demote on uncheck.** On a task with all subtasks done and parent status `done` (advance the cycle manually to get there), uncheck a subtask. Confirm the parent immediately becomes `in-progress` and the gold ring/check disappears.
   - (e) **v1 → v2 migration.** Open DevTools → Application → IndexedDB → TodoApp. Confirm the database version is `2`. Confirm every `tasks` row has a `subtasks` array (empty for previously-existing rows). To test the upgrade path itself, the implementer may delete the IDB, run the previous commit, create a task, then run the current commit and reload; on reload the v1 row must be present with `subtasks: []` and no errors logged.

3. Stop the dev server when finished. Do not commit anything in this task — there are no code changes. Record the manual-smoke results in the PR description on push.

**Verification**

- `pnpm build` — exit code 0.
- All five manual-smoke scenarios above — pass.

**Commit**

(none — this task makes no code changes)
