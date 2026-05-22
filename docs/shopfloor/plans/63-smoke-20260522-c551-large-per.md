# Plan: Per-task subtasks with completion rollup

Issue: [#63](https://github.com/niranjan94/shopfloor-smoke/issues/63) — `smoke-20260522-c551/large: per-task subtasks with rollup`
Spec: [`docs/shopfloor/specs/63-smoke-20260522-c551-large-per.md`](../specs/63-smoke-20260522-c551-large-per.md)

## Testing strategy

Reproduced from the spec's `## Testing strategy` section.

`CLAUDE.md` is explicit: *"No tests: this is a smoke test target, not a tested app. There is no test suite."* `package.json` exposes only `dev`, `build`, `start`, and `lint` — no test runner is configured, and there is no `test/`, `tests/`, `spec/`, or `__tests__/` directory in the repo.

Layers and their applicability:

- **Unit / integration / e2e tests:** *not applicable.* Reason: project explicitly documents that no test suite exists and this app is a smoke-test target driven from outside, not a tested library. Adding a runner is out of scope for this issue.
- **Type check (`pnpm exec tsc`):** *applicable and required.* Must pass after the change. The required `subtasks` field on `Task` will surface any read path that has not been updated, including `handleSave`'s task construction.
- **Lint (`pnpm lint`):** *applicable and required.* Must pass after the change with no new warnings introduced in `app/types.ts`, `app/db.ts`, or `app/page.tsx`.
- **Production build (`pnpm build`):** *applicable and required.* Must succeed; this is the gate Next.js's smoke harness uses.
- **Manual smoke verification in `pnpm dev`:** *applicable and required.* See Task 6 for the exact checklist.

Because no automated test layer exists for this codebase, the per-task TDD shape (steps 1–4) is skipped on every task in this plan. Each task line below labels the exception explicitly. Verification is concentrated in the final task (Task 6), which runs `pnpm exec tsc`, `pnpm lint`, `pnpm build`, and the manual smoke list.

## Task graph at a glance

| # | Title | Files | Why this is atomic |
|---|---|---|---|
| 1 | Add `Subtask` type, extend `Task`, initialize `subtasks` in `handleSave` | `app/types.ts`, `app/page.tsx` | Required field on `Task` forces a same-commit update to the one constructor (`handleSave`) so `pnpm exec tsc` stays green. |
| 2 | Bump IndexedDB to v2 with cursor backfill | `app/db.ts` | Schema/version change in one file; uses the type from Task 1. |
| 3 | Add `allSubtasksDone` / `rollupStatus` helpers and wire into `cycleStatus` | `app/page.tsx` | Establishes the single chokepoint used by Task 4. |
| 4 | Add `subtaskDraft` state and `addSubtask` / `toggleSubtask` / `deleteSubtask` handlers | `app/page.tsx` | Pure handler code; rendering still absent so handlers are unreferenced — accepted, completes in Task 5. |
| 5 | Render subtask section in task card and update status-circle tooltip | `app/page.tsx` | JSX-only change that wires the handlers from Task 4 to the DOM. |
| 6 | Verification pass | none | Runs the only test layers this project has. |

---

## Task 1 — Add `Subtask` type, extend `Task`, initialize `subtasks` in `handleSave`

**Non-feature exception:** TDD steps 1–4 skipped — no test runner. Verification deferred to Task 6.

**Affected files**

- Modify: `app/types.ts`
- Modify: `app/page.tsx`

**Step 1.1 — `app/types.ts`**

Add a new exported `Subtask` interface and a required `subtasks: Subtask[]` field on `Task`. Final content of the file:

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

`subtasks` is required, not optional. Task 2's migration guarantees the field is present on every persisted row, and Task 1.2 initializes it on the only in-memory constructor.

**Step 1.2 — `app/page.tsx` (`handleSave`)**

In `app/page.tsx:71-82`, the literal that constructs `task: Task` is missing the new field. Add one line so the constructor preserves an existing task's subtasks and starts new tasks with `[]`. After the change the literal must read:

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

Do not touch any other field. The `?? []` here is for the editing path; on a fresh install no existing tasks are passed in, and the migration in Task 2 guarantees rehydrated tasks already carry the field.

**Verification at this task:** none (deferred to Task 6).

**Commit**

```
feat(types): add required Subtask field to Task model
```

---

## Task 2 — Bump IndexedDB to v2 with cursor backfill

**Non-feature exception:** TDD steps 1–4 skipped — no test runner. Manual IndexedDB inspection happens in Task 6.

**Affected files**

- Modify: `app/db.ts`

**Step 2.1 — version constant**

In `app/db.ts:4`, change `const DB_VERSION = 1;` to `const DB_VERSION = 2;`. No other line in the file references the literal `1`, so no other replacement is needed.

**Step 2.2 — `onupgradeneeded` handler**

Replace the existing `request.onupgradeneeded = (event) => { … };` block at `app/db.ts:25-37` with the version below. The fresh-install branch (creating the stores) is unchanged; the new block is the `event.oldVersion < 2` cursor backfill, which reuses the upgrade transaction.

```ts
request.onupgradeneeded = (event) => {
  const target = event.target as IDBOpenDBRequest;
  const db = target.result;
  const tx = target.transaction!;

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

Notes:

- `target.transaction!` is the upgrade transaction; the non-null assertion is safe because `onupgradeneeded` always runs inside one.
- The cursor only writes when the field is missing, so the branch is idempotent if a future v3 ever re-enters it.
- A fresh install enters the first `if (!db.objectStoreNames.contains(TASKS_STORE))` block and skips the cursor branch because the store was just created and is empty — `openCursor` would yield `null` immediately anyway, but the explicit `db.objectStoreNames.contains` guard makes the read-order intent clear.

**Step 2.3 — leave the rest of `app/db.ts` unchanged**

`addTask`, `updateTask`, `getTasks`, `getTaskById`, `getTasksByCategory`, and the category methods all take or return `Task` already; they pick up the new field through the type.

**Verification at this task:** none (deferred to Task 6).

**Commit**

```
feat(db): migrate TodoApp to v2 with subtasks backfill
```

---

## Task 3 — Add rollup helpers and wire into `cycleStatus`

**Non-feature exception:** TDD steps 1–4 skipped — no test runner. Manual rotation check happens in Task 6.

**Affected files**

- Modify: `app/page.tsx`

**Step 3.1 — helpers**

Add two pure helpers in `app/page.tsx` immediately after the existing `statusLabel` function (currently ending at `app/page.tsx:31`). They live at module scope, not inside `Home`, so they are not re-created per render and may be hoisted alongside the other small format helpers.

```ts
function allSubtasksDone(task: Task): boolean {
  return task.subtasks.length === 0 || task.subtasks.every((s) => s.done);
}

function rollupStatus(current: Task["status"], task: Task): Task["status"] {
  if (current === "done" && !allSubtasksDone(task)) return "in-progress";
  return current;
}
```

Contract:

- `allSubtasksDone(task)` returns `true` for an empty `subtasks` array so tasks with no subtasks behave exactly as before.
- `rollupStatus(current, task)` is the single place the cap is enforced. It only ever demotes `"done" → "in-progress"`; it never promotes.

**Step 3.2 — wire into `cycleStatus`**

Replace the body of `cycleStatus` at `app/page.tsx:116-128` with the version below. The change: compute the raw next status from the rotation table, pass it through `rollupStatus(nextRaw, task)`, and base `completedAt` on the *post-rollup* status so a capped advance does not stamp a completion time.

```ts
async function cycleStatus(task: Task) {
  const next: Record<string, Task["status"]> = { todo: "in-progress", "in-progress": "done", done: "todo" };
  const nextRaw = next[task.status];
  const nextStatus = rollupStatus(nextRaw, task);
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

This matches the spec's "next status becomes `todo`" outcome for a parent in `"in-progress"` with incomplete subtasks: `nextRaw` is `"done"`, `rollupStatus` demotes it back to `"in-progress"`, and the next click cycles `"in-progress" → "done" → rollupStatus → "in-progress"`. Wait — re-examine: when `task.status === "in-progress"` and subtasks incomplete, `nextRaw = "done"`, `rollupStatus` returns `"in-progress"`, so the click is a no-op visually. The spec calls for the rotation to *continue* but skip `"done"`. To achieve `"in-progress" → "todo"` when capped, extend the rotation logic: if `rollupStatus(nextRaw, task) !== nextRaw`, advance one more step in the rotation table. Final body:

```ts
async function cycleStatus(task: Task) {
  const next: Record<string, Task["status"]> = { todo: "in-progress", "in-progress": "done", done: "todo" };
  const nextRaw = next[task.status];
  const capped = rollupStatus(nextRaw, task);
  const nextStatus = capped === nextRaw ? nextRaw : next[capped];
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

Walkthrough with incomplete subtasks:

- `task.status === "todo"` → `nextRaw = "in-progress"` → `capped = "in-progress"` → `nextStatus = "in-progress"`. ✓
- `task.status === "in-progress"` → `nextRaw = "done"` → `capped = "in-progress"` (demoted) → `nextStatus = next["in-progress"] = "done"`… that loops. Adjust: when `capped !== nextRaw`, skip to `next[capped]` *only if it would not loop back*. Simpler: when capped demoted, set `nextStatus = "todo"` directly per the spec example. Use this final form:

```ts
async function cycleStatus(task: Task) {
  const next: Record<string, Task["status"]> = { todo: "in-progress", "in-progress": "done", done: "todo" };
  const nextRaw = next[task.status];
  const capped = rollupStatus(nextRaw, task);
  // When the cap demotes "done" → "in-progress", continue the rotation past the
  // skipped "done" step so the click still advances visibly. Spec: incomplete
  // subtasks make the rotation go "todo → in-progress → todo".
  const nextStatus = capped === nextRaw ? nextRaw : "todo";
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

Walkthrough confirmation with incomplete subtasks:

- `"todo"` → `nextRaw = "in-progress"` → `capped = "in-progress"` (no demotion) → `nextStatus = "in-progress"`. ✓
- `"in-progress"` → `nextRaw = "done"` → `capped = "in-progress"` (demoted) → `nextStatus = "todo"`. ✓ Matches spec ("next status becomes `todo`").
- `"done"` (only reachable if subtasks became incomplete after the fact; see Task 4) → `nextRaw = "todo"` → `capped = "todo"` → `nextStatus = "todo"`. ✓

Walkthrough with no subtasks (`allSubtasksDone` returns true):

- `"todo" → "in-progress" → "done" → "todo"` — unchanged from current behavior.

**Step 3.3 — leave the rest of `Home` unchanged in this task**

Do not add any state, handler, or JSX in this task; those land in Tasks 4 and 5.

**Verification at this task:** none (deferred to Task 6).

**Commit**

```
feat(tasks): cap parent status while subtasks are incomplete
```

---

## Task 4 — Add `subtaskDraft` state and subtask CRUD handlers

**Non-feature exception:** TDD steps 1–4 skipped — no test runner. Handlers are exercised manually in Task 6.

**Affected files**

- Modify: `app/page.tsx`

**Step 4.1 — state**

Add a single new `useState` at the top of `Home`, immediately below the existing `const [loading, setLoading] = useState(true);` at `app/page.tsx:47`:

```ts
const [subtaskDraft, setSubtaskDraft] = useState<Record<string, string>>({});
```

Keyed by parent task id so each card keeps its own draft without a child component.

**Step 4.2 — handlers**

Add the three handlers inside `Home`, immediately after `cycleStatus` (after the closing brace at `app/page.tsx:128`). Each one rebuilds the parent `Task`, runs it through `rollupStatus`, clears `completedAt` if the rollup demoted off `"done"`, persists with `db.updateTask`, and writes back to `tasks` state.

```ts
async function addSubtask(parentId: string): Promise<void> {
  const title = (subtaskDraft[parentId] ?? "").trim();
  if (!title) return;
  const parent = tasks.find((t) => t.id === parentId);
  if (!parent) return;
  const now = new Date().toISOString();
  const newSub: Subtask = {
    id: Date.now().toString(),
    title,
    done: false,
    createdAt: now,
  };
  const withSub: Task = { ...parent, subtasks: [...parent.subtasks, newSub] };
  const nextStatus = rollupStatus(withSub.status, withSub);
  const updated: Task = {
    ...withSub,
    status: nextStatus,
    completedAt: nextStatus === "done" ? withSub.completedAt : undefined,
    updatedAt: now,
  };
  try {
    await db.updateTask(updated);
    setTasks((prev) => prev.map((t) => (t.id === parentId ? updated : t)));
    setSubtaskDraft((prev) => ({ ...prev, [parentId]: "" }));
  } catch (e) { console.error(e); }
}

async function toggleSubtask(parentId: string, subtaskId: string): Promise<void> {
  const parent = tasks.find((t) => t.id === parentId);
  if (!parent) return;
  const now = new Date().toISOString();
  const nextSubs = parent.subtasks.map((s) =>
    s.id === subtaskId ? { ...s, done: !s.done } : s,
  );
  const withSubs: Task = { ...parent, subtasks: nextSubs };
  const nextStatus = rollupStatus(withSubs.status, withSubs);
  const updated: Task = {
    ...withSubs,
    status: nextStatus,
    completedAt: nextStatus === "done" ? withSubs.completedAt : undefined,
    updatedAt: now,
  };
  try {
    await db.updateTask(updated);
    setTasks((prev) => prev.map((t) => (t.id === parentId ? updated : t)));
  } catch (e) { console.error(e); }
}

async function deleteSubtask(parentId: string, subtaskId: string): Promise<void> {
  const parent = tasks.find((t) => t.id === parentId);
  if (!parent) return;
  const now = new Date().toISOString();
  const nextSubs = parent.subtasks.filter((s) => s.id !== subtaskId);
  const withSubs: Task = { ...parent, subtasks: nextSubs };
  const nextStatus = rollupStatus(withSubs.status, withSubs);
  const updated: Task = {
    ...withSubs,
    status: nextStatus,
    completedAt: nextStatus === "done" ? withSubs.completedAt : undefined,
    updatedAt: now,
  };
  try {
    await db.updateTask(updated);
    setTasks((prev) => prev.map((t) => (t.id === parentId ? updated : t)));
  } catch (e) { console.error(e); }
}
```

`Subtask` is already exported from `./types`; extend the existing import line at `app/page.tsx:4` from:

```ts
import { Task, Category } from "./types";
```

to:

```ts
import { Task, Category, Subtask } from "./types";
```

**Step 4.3 — accepted lint warning**

At the end of this task the three handlers and the new state setter are declared but not referenced; Task 5 wires them up. If ESLint flags `subtaskDraft` / `addSubtask` / `toggleSubtask` / `deleteSubtask` as unused at this commit, ignore the warning — Task 5 lands in the same PR and resolves it. Do not add eslint-disable comments.

**Verification at this task:** none (deferred to Task 6).

**Commit**

```
feat(tasks): add subtask CRUD handlers with rollup
```

---

## Task 5 — Render subtask section in task card and update status-circle tooltip

**Non-feature exception:** TDD steps 1–4 skipped — no test runner. UI is exercised manually in Task 6.

**Affected files**

- Modify: `app/page.tsx`

**Step 5.1 — status-circle tooltip**

In the `button` at `app/page.tsx:297-319`, replace the existing `title` prop:

```tsx
title={`Status: ${statusLabel(task.status)} — click to advance`}
```

with a computed version that surfaces the cap when one applies:

```tsx
title={
  !allSubtasksDone(task) && task.status === "in-progress"
    ? `Status: ${statusLabel(task.status)} — finish subtasks to mark done`
    : `Status: ${statusLabel(task.status)} — click to advance`
}
```

The click handler remains `() => cycleStatus(task)`. The cap is enforced inside `cycleStatus` (Task 3); the button is never disabled, so the smoke harness can still click it.

**Step 5.2 — subtask section**

Inside the existing task-card content `<div>` (the one that opens at `app/page.tsx:322`), after the badges row that closes at `app/page.tsx:354` and *before* the closing `</div>` of the content wrapper at `app/page.tsx:355`, insert the JSX block below. Keep the section inline in `page.tsx`; do not extract a new file or component.

```tsx
<div
  style={{
    marginTop: "0.75rem",
    paddingTop: "0.75rem",
    borderTop: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  }}
>
  {task.subtasks.length > 0 && (
    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
      {task.subtasks.filter((s) => s.done).length} / {task.subtasks.length} done
    </div>
  )}

  {task.subtasks.map((sub) => (
    <div
      key={sub.id}
      style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
    >
      <button
        onClick={() => toggleSubtask(task.id, sub.id)}
        title={sub.done ? "Mark as not done" : "Mark as done"}
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
          transition: "all 150ms ease",
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
        }}
      >
        {sub.title}
      </span>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => deleteSubtask(task.id, sub.id)}
      >
        Delete
      </button>
    </div>
  ))}

  <div style={{ display: "flex", gap: "0.5rem" }}>
    <input
      className="input"
      type="text"
      placeholder="Add subtask…"
      value={subtaskDraft[task.id] ?? ""}
      onChange={(e) =>
        setSubtaskDraft((prev) => ({ ...prev, [task.id]: e.target.value }))
      }
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          addSubtask(task.id);
        }
      }}
      style={{ flex: 1 }}
    />
    <button className="btn btn-sm" onClick={() => addSubtask(task.id)}>
      Add
    </button>
  </div>
</div>
```

Notes:

- The progress label is hidden when `task.subtasks.length === 0` so a brand-new task does not show `0 / 0 done`.
- The add row is always rendered, even with zero subtasks, so the smoke harness has a deterministic place to click.
- All class names used (`input`, `btn`, `btn-sm`, `btn-ghost`) already exist in the project's global stylesheet — no CSS file changes.
- The section is placed inside the content `<div>` (not a sibling) so the existing flex layout of `status-circle | content | actions` is preserved; the subtask block sits below the badges within the content column.

**Step 5.3 — leave actions and other UI unchanged**

Do not move the Edit / Delete buttons, do not change the priority class, do not touch the form or filters.

**Verification at this task:** none (deferred to Task 6).

**Commit**

```
feat(tasks): render subtask tree under each task card
```

---

## Task 6 — Verification pass

**Non-feature exception:** TDD shape does not apply — this task *is* the verification. No production code change.

**Affected files**

- None edited.

**Step 6.1 — automated checks**

Run, in order, from the repo root. Each must exit 0 with no new warnings or errors attributable to this PR.

```bash
pnpm install
pnpm exec tsc
pnpm lint
pnpm build
```

Expected outputs:

- `pnpm exec tsc` — no output (success).
- `pnpm lint` — `✓ No ESLint warnings or errors` (or equivalent clean Next.js lint summary). Specifically: no "is declared but never used" warnings for `subtaskDraft`, `addSubtask`, `toggleSubtask`, or `deleteSubtask` (Task 5 references them all).
- `pnpm build` — finishes with `✓ Compiled successfully` and prints the route summary.

If any of these fail, do not commit a fix as a new task — return to the task that introduced the regression and fix in place; the plan PR has not yet been opened by the implementer.

**Step 6.2 — manual smoke verification**

Start the dev server with `pnpm dev` and open `http://localhost:3000`. Use Chrome or Edge DevTools (Application → IndexedDB → `TodoApp` → `tasks`) to inspect persisted rows.

Run this exact sequence. Each numbered step is a pass criterion.

1. **Migration backfill.** Before pulling this branch, on `main`, load the app and create at least three tasks (mix of `todo`, `in-progress`, `done` statuses). Stop the dev server. Switch to the implementation branch, restart `pnpm dev`, reload the page. Open DevTools → Application → IndexedDB → `TodoApp` → `tasks`. **Pass:** every existing row now has a `subtasks: []` field; no row is missing; all other fields (title, status, completedAt, etc.) are unchanged; the database version shown in DevTools is `2`.
2. **Add, toggle, delete subtasks.** On any task, type `"buy milk"` into the subtask input and press Enter. **Pass:** the subtask appears with an empty circle, the progress label reads `0 / 1 done`, and the input is cleared. Click the circle. **Pass:** the circle fills, the title gets a strikethrough, and the label reads `1 / 1 done`. Click `Delete` on the row. **Pass:** the row vanishes and the progress label disappears (because count is back to 0).
3. **Capped rotation skips `done`.** On a task with at least one *incomplete* subtask, click the parent status circle from `todo`. **Pass:** advances to `in-progress`. Click again. **Pass:** advances to `todo` (skipping `done`). Tooltip on the circle while in `in-progress` reads `Status: In Progress — finish subtasks to mark done`.
4. **Full rotation when no subtasks.** On a task with zero subtasks, click the parent status circle three times. **Pass:** rotation is `todo → in-progress → done → todo`, exactly as on `main`. The `done` state stamps a `completedAt` visible in DevTools.
5. **Demotion when reopening a subtask.** Create a task, add one subtask, mark the subtask done, then click the parent circle to advance `todo → in-progress → done`. **Pass:** parent status is `done` and `completedAt` is set in DevTools. Now toggle the subtask back to incomplete. **Pass:** the parent's status badge in the card flips from `Done` to `In Progress`, the strikethrough on the parent title disappears, and the persisted row in DevTools shows `status: "in-progress"` and `completedAt: undefined`.

Document any failure on the PR; do not paper over it with a follow-up step in this plan.

**Step 6.3 — commit**

This task makes no file changes; it produces no commit. If the implementation agent's workflow requires every task to end with a commit, it may instead create an empty `chore: verify subtasks rollup smoke` commit, but skipping is preferred to keep the history minimal.

**Commit (optional)**

```
chore: verify subtasks rollup smoke
```

---

## Self-review against the rubric

- **Completeness.** Testing strategy reproduced verbatim from spec. Every task lists exact files, exact code, exact commit messages, and exact verification commands. No `TBD`, no `…` elisions, no "similar to above".
- **Spec alignment.** Each spec decision maps to a task: required `subtasks` field (Task 1) · v2 cursor-backfill migration (Task 2) · `allSubtasksDone` / `rollupStatus` and `cycleStatus` wiring (Task 3) · `subtaskDraft` state and three CRUD handlers (Task 4) · inline JSX section and tooltip update (Task 5) · type/lint/build/manual checks from spec's testing strategy (Task 6). No task contradicts a spec decision; the one place the plan goes beyond the spec is Task 3's explicit `"in-progress" → "todo"` branch, which is the spec's own example outcome written out as code.
- **Task decomposition.** Each task changes one logical unit, declares its files, and references only test layers (or the lack thereof) that the testing strategy section names.
- **Buildability.** Every type, function signature, file path, and DOM placement is spelled out. The implementer never needs to re-read the spec mid-task.

**Red-flag re-scan.** No `should` / `probably` / `try to` in instructions; no deferred work without an explicit owner (`completedAt` clearing is in Task 4); type names (`Task`, `Subtask`) and function names (`allSubtasksDone`, `rollupStatus`, `addSubtask`, `toggleSubtask`, `deleteSubtask`, `cycleStatus`) are consistent across tasks; every verification step references either `pnpm exec tsc`, `pnpm lint`, `pnpm build`, or the manual checklist named in the testing strategy.
