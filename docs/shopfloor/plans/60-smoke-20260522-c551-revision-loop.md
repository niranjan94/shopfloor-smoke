# Plan: Clear completed tasks button (#60)

## Context

Issue #60 requests a "Clear completed" button on the tasks list. The button deletes every task whose `status === "done"` by calling `db.deleteTask` for each, then updates React state. Constraints from the issue:

- Touch `app/page.tsx` and at most one new helper file under `app/components/`.
- Button must be hidden when no completed tasks exist.
- Button must show a `window.confirm` prompt before deleting.
- UI + client-side state only. No schema changes.

Design decision (from triage comment and codebase review): keep the implementation **inline** in `app/page.tsx`. No new helper file. Rationale: the button is one element rendered in the task-list header row, and the handler mirrors the existing `handleDelete` pattern at `app/page.tsx:95-100`. Extracting a component for one button and one handler would add indirection without improving readability.

Relevant existing code:

- `handleDelete` at `app/page.tsx:95-100` — the pattern to mirror.
- `db.deleteTask(id)` at `app/db.ts:64-73` — single-task delete; we call it in a loop.
- `stats.done` computed at `app/page.tsx:157` — the gate for showing the button.
- Task-list header `<div>` at `app/page.tsx:279-281` containing the `<h2>` count — where the button is rendered.

## Testing strategy

Per `CLAUDE.md`: **"No tests: this is a smoke test target, not a tested app. There is no test suite."** No unit, integration, or e2e test layer exists in this repo. The implementer must NOT introduce one — the project explicitly opts out.

Verification layers for every feature task in this plan:

| Layer | Command | Directory | Purpose |
| --- | --- | --- | --- |
| Type check | `pnpm exec tsc` | repo root | Confirm no TypeScript errors across the project. |
| Lint | `pnpm lint` | repo root | Confirm ESLint passes (uses `eslint-config-next`). |
| Build | `pnpm build` | repo root | Confirm the Next.js production build compiles. |
| Manual smoke | `pnpm dev` then exercise the feature at `http://localhost:3000` | repo root | Confirm the UI behaves as specified. The implementer reports observed behavior in the PR description. |

Skipped layers: automated unit/integration/e2e tests (none exist in the project; do not add).

The TDD five-step shape is therefore adapted as follows for tasks in this plan: write production change → run type check → run lint → run build → manually smoke the feature → commit. Each task lists the exact manual smoke steps and expected observations.

## Tasks

### Task 1 — Add `handleClearCompleted` handler and conditional button

**Goal:** Implement the entire feature in a single cohesive change: add the async handler that deletes all done tasks, and render the "Clear completed" button in the task-list header gated by `stats.done > 0` and `window.confirm`.

**Affected files:**

- Modify: `app/page.tsx`
- Create: (none)
- Test: (none — see testing strategy)

**Step 1 — Add the `handleClearCompleted` function.**

Insert the following function in `app/page.tsx` immediately after `handleDelete` (which ends at line 100) and before `handleEdit` (which begins at line 102):

```tsx
  async function handleClearCompleted() {
    const doneTasks = tasks.filter((t) => t.status === "done");
    if (doneTasks.length === 0) return;
    if (!window.confirm(`Delete ${doneTasks.length} completed ${doneTasks.length === 1 ? "task" : "tasks"}?`)) return;
    try {
      await Promise.all(doneTasks.map((t) => db.deleteTask(t.id)));
      setTasks((prev) => prev.filter((t) => t.status !== "done"));
    } catch (e) { console.error(e); }
  }
```

Notes on this code (do not add as comments to the file):

- Filters from current `tasks` state, not from `filtered`, because the button clears ALL completed tasks regardless of active filters.
- Early-returns if `doneTasks.length === 0`. This is defensive; the button itself is also gated on `stats.done > 0` so this branch is normally unreachable, but it protects against a race if state changes between render and click.
- Uses `Promise.all` over `db.deleteTask(t.id)` for each done task, matching the IndexedDB single-record delete API (no bulk delete exists in `app/db.ts`).
- State update uses functional form `setTasks((prev) => prev.filter(...))` to match the style used by `handleDelete` and avoid stale-closure issues.
- Error handling uses `console.error(e)` only, matching every other handler in the file (`handleSave`, `handleDelete`, `cycleStatus`).

**Step 2 — Render the conditional button in the task-list header.**

Replace the header `<div>` at `app/page.tsx:279-281`:

```tsx
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.875rem" }}>
            <h2>{filtered.length} {filtered.length === 1 ? "Task" : "Tasks"}</h2>
          </div>
```

with:

```tsx
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.875rem" }}>
            <h2>{filtered.length} {filtered.length === 1 ? "Task" : "Tasks"}</h2>
            {stats.done > 0 && (
              <button className="btn btn-danger btn-sm" onClick={handleClearCompleted}>
                Clear completed ({stats.done})
              </button>
            )}
          </div>
```

Notes on this code:

- Gating condition is `stats.done > 0`. `stats.done` is already computed at `app/page.tsx:157` and counts the unfiltered tasks list, which matches the handler's behavior (clears all done tasks, not just filtered).
- Button uses existing utility classes `btn btn-danger btn-sm` for visual consistency with the per-task Delete button at `app/page.tsx:362-364`.
- The count `({stats.done})` is included in the label so the user sees how many tasks the action will affect before clicking.

**Step 3 — Type check.**

Run `pnpm exec tsc`. Expected output: no errors (exit code 0, no stdout).

**Step 4 — Lint.**

Run `pnpm lint`. Expected output: no errors. If ESLint flags `react-hooks/exhaustive-deps` or similar on the new handler, treat it as a real signal and resolve it — do not disable the rule.

**Step 5 — Build.**

Run `pnpm build`. Expected output: successful Next.js production build, no compile errors.

**Step 6 — Manual smoke (golden path).**

Start the dev server with `pnpm dev` and open `http://localhost:3000`. Perform the following sequence and confirm each observation:

1. Fresh state with no tasks: confirm the "Clear completed" button is **not** visible in the task-list header.
2. Create three tasks: "A", "B", "C". Confirm the button is still **not** visible (all three are `todo`).
3. Click the status circle on task "A" twice (advances `todo → in-progress → done`). Confirm:
   - Task "A" shows the green check and strikethrough.
   - The "Done" stat card shows `1`.
   - The "Clear completed (1)" button is now visible to the right of the task count `<h2>`.
4. Click "Clear completed (1)". Confirm a browser `window.confirm` dialog appears with text `Delete 1 completed task?`.
5. Click Cancel in the dialog. Confirm: task "A" still exists, still marked done, button still visible.
6. Click "Clear completed (1)" again, click OK in the dialog. Confirm:
   - Task "A" disappears from the list immediately.
   - The "Done" stat card returns to `0`.
   - The "Clear completed" button is no longer visible.
   - Refreshing the page (F5) confirms task "A" is also gone from IndexedDB — only "B" and "C" remain.
7. Mark both "B" and "C" as done. Confirm button label reads "Clear completed (2)" and dialog text reads `Delete 2 completed tasks?` (plural).

**Step 7 — Manual smoke (edge cases).**

1. Filter interaction: with tasks "B" and "C" both done, set the Status filter to "To Do". Confirm:
   - The task list shows "No tasks match your filters."
   - The "Clear completed (2)" button is still visible (it is gated on `stats.done`, not on `filtered`).
   - Clicking the button and confirming deletes both "B" and "C" even though they were not in the filtered view.
2. Confirm dialog dismissal via keyboard (Escape) is treated as Cancel — no tasks deleted.
3. After deleting all done tasks, confirm the "Clear completed" button disappears within the same render (no manual refresh needed).

If any step fails, fix the cause before committing. Do not commit a partial implementation.

**Step 8 — Commit.**

Stage `app/page.tsx` and commit with this exact message:

```
feat(tasks): add clear-completed button to task list
```

## Out of scope

- No bulk-delete method on `app/db.ts`. Issue says no schema changes; the per-id loop is acceptable for a smoke-test target with small task counts.
- No undo / trash behavior. Issue specifies `window.confirm` is sufficient.
- No new helper component under `app/components/`. Decision recorded above; inline is simpler and matches existing patterns.
- No tests. Project explicitly has no test suite (`CLAUDE.md`).
