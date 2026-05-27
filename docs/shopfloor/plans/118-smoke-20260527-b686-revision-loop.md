# Plan: Clear-completed button on tasks list

Issue: [#118 — smoke-20260527-b686/revision-loop: clear-completed button](https://github.com/niranjan94/shopfloor-smoke/issues/118)

Branch: `shopfloor/plan/118-smoke-20260527-b686-revision-loop`

## Summary

Add a "Clear completed" button to the tasks-list header in `app/page.tsx`. When clicked, it asks the user to confirm via `window.confirm`, then deletes every task whose `status === "done"` by calling `db.deleteTask` for each, and finally updates React state in a single `setTasks` call. The button is conditionally rendered — it is hidden whenever there are zero completed tasks. No new files are created; the change is confined to `app/page.tsx`.

## Testing strategy

This project has **no automated test suite**. `CLAUDE.md` explicitly states "No tests: this is a smoke test target, not a tested app." The verification layers available to the implementer, as listed in `CLAUDE.md` / `package.json`, are:

- **Type check** — `pnpm exec tsc --noEmit` — verifies TypeScript correctness across `app/**`.
- **Lint** — `pnpm lint` — runs `eslint` with `eslint-config-next`.
- **Production build** — `pnpm build` — runs `next build` and fails on any compile or lint error that breaks the build.
- **Manual smoke in dev server** — `pnpm dev` then exercise the feature in a browser at `http://localhost:3000`. This is the project's de facto behavioural test layer.

There is no unit-test, integration-test, or e2e-test layer in this repo, so the TDD "write failing test first" steps in the rule book are **skipped for every task in this plan**. Every task is verified instead by running the four layers above and the manual smoke script in Task 3. Each task lists the specific commands and expected outputs it must produce.

## Tasks

### Task 1 — Add `handleClearCompleted` function and wire button into the task-list header

Affected files:

- Modify: `app/page.tsx`

This task introduces the new handler and renders the button. The button must be hidden when there are zero completed tasks. The hide-condition uses the already-computed `stats.done` value at `app/page.tsx:157`, because that value is the single source of truth for done-count elsewhere in the file (the "Done" stat card at `app/page.tsx:188`). Re-deriving the count in a separate expression would risk drift if the status enum ever changes.

Deletion strategy: **sequential** `await` inside a `for` loop, not `Promise.all`. Reason: `db.deleteTask` opens its own IndexedDB transaction per call (see `app/db.ts:64-73`), and the existing single-delete handler `handleDelete` at `app/page.tsx:95-100` already uses the await-then-update pattern. Sequential deletes keep the same shape and avoid concurrent transactions on the same store. The state update is performed once at the end with a single `setTasks` filter, not inside the loop, to minimise re-renders.

Confirmation message: `Delete N completed task(s)? This cannot be undone.` where `N` is the count of done tasks, computed once before the `window.confirm` call.

Error handling: the existing `handleDelete` wraps the call in `try/catch` and logs to `console.error`. Mirror this exactly. On any thrown error during the loop, log and stop; do not attempt to "roll back" successful deletes — there is no rollback semantics in IndexedDB here and the existing code does not roll back either.

Step-by-step changes:

1. **Add the handler function.** Insert directly after the existing `handleDelete` function (i.e., after `app/page.tsx:100`, before `function handleEdit` at `app/page.tsx:102`). The exact code to insert:

   ```tsx
   async function handleClearCompleted() {
     const completed = tasks.filter((t) => t.status === "done");
     if (completed.length === 0) return;
     if (!window.confirm(`Delete ${completed.length} completed task(s)? This cannot be undone.`)) return;
     try {
       for (const t of completed) {
         await db.deleteTask(t.id);
       }
       const completedIds = new Set(completed.map((t) => t.id));
       setTasks((prev) => prev.filter((t) => !completedIds.has(t.id)));
     } catch (e) { console.error(e); }
   }
   ```

   Notes:
   - `completed` is snapshotted before the confirm dialog so the count shown to the user matches the set actually deleted, even if `tasks` changes during the await loop (it cannot, in practice, because React state is frozen during a render, but the snapshot is defensive and matches the file's style).
   - The early-return when `completed.length === 0` is belt-and-braces; the button itself is hidden in that state, but a future caller (e.g., a keyboard shortcut) could still invoke the handler.
   - The single `setTasks` call after the loop matches the file's "compute, then setState once" idiom (see `handleSave` at `app/page.tsx:67-93`).

2. **Render the button in the task-list header.** The header row at `app/page.tsx:279-281` is currently:

   ```tsx
   <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.875rem" }}>
     <h2>{filtered.length} {filtered.length === 1 ? "Task" : "Tasks"}</h2>
   </div>
   ```

   Replace it with:

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

   Notes:
   - The button reuses the existing `btn btn-danger btn-sm` class triplet, the same triplet already used by the per-task Delete button at `app/page.tsx:362`. This keeps the visual language consistent without inventing a new class.
   - The label includes the count `(N)` so the user sees the impact at a glance, mirroring how the "Done" stat card already surfaces this number.
   - The `justifyContent: "space-between"` on the parent row places `<h2>` on the left and the new button on the right with no extra wrapper needed.

3. **Do not touch anything else.** The `db.ts` module, `types.ts`, and the form / filters / per-task action buttons must be unchanged. No new imports are required — `db` is already imported at `app/page.tsx:5` and React state hooks at `app/page.tsx:3`.

Verification (per the testing-strategy section above, no test layer exists so the TDD steps are skipped — non-feature exception does not apply, but no test layer means steps 1, 2, 4 are not runnable; steps 3 and 5 still apply):

- Run `pnpm exec tsc --noEmit` from the repo root. Expected: exits 0 with no output.
- Run `pnpm lint` from the repo root. Expected: exits 0 with no error or warning attributable to `app/page.tsx`.
- Stage and commit using the message below.

Commit message (Conventional Commits):

```
feat(tasks): add clear-completed button to task list
```

### Task 2 — Verify production build succeeds

Affected files:

- (none; build-only verification)

This task is a **non-feature verification task** (per the rule book's "Exception for non-feature tasks"). No new test is written; we run the existing build to catch anything `tsc --noEmit` and `eslint` missed (Next.js's own per-page checks, RSC/client-boundary issues, etc.).

Steps:

1. Run `pnpm build` from the repo root.
2. Expected output: build completes with `✓ Compiled successfully` (or the Next.js 16 equivalent) and exits 0. The route `/` must appear in the build's route table and must be marked as a Client Component (it already is — `"use client"` at `app/page.tsx:1`).
3. If the build fails, the failure is a defect in Task 1 — return to Task 1, fix the cause, re-run `pnpm exec tsc --noEmit` and `pnpm lint`, then re-run `pnpm build`. Do not commit a separate "fix" — amend or replace the Task 1 commit so history shows a single working change. (Per the project's git policy this means resetting the Task 1 commit, fixing, and re-committing with the same message; do NOT use `git commit --amend` on a pushed commit and do NOT force-push without explicit user approval — if the Task 1 commit has been pushed, create a follow-up `fix(tasks): ...` commit instead.)
4. If the build succeeds, **no new commit is created** for this task — verification only. Proceed to Task 3.

There is no commit message for this task because no files change.

### Task 3 — Manual smoke verification in dev server

Affected files:

- (none; manual verification)

This task is a **non-feature verification task** (per the rule book's "Exception for non-feature tasks"). It exists because the project has no automated UI test layer, so manual exercise in a browser is the only way to confirm the feature behaves correctly end-to-end. No commit is produced.

Steps:

1. Start the dev server: `pnpm dev`. Expected: server reports listening at `http://localhost:3000`.
2. Open `http://localhost:3000` in a browser.
3. **Hide-when-empty check.** With zero tasks of status `done` in the list (delete any existing done tasks first if necessary using the per-task Delete button), confirm the "Clear completed" button is **not rendered** in the task-list header. The header should show only `N Tasks` on the left.
4. **Single-completed check.**
   - Create a new task (any title).
   - Click its status circle twice to advance `todo → in-progress → done`.
   - Confirm the "Clear completed (1)" button now appears on the right of the task-list header.
   - Click it. Confirm `window.confirm` shows the message `Delete 1 completed task(s)? This cannot be undone.`.
   - Click Cancel in the dialog. Confirm the task is still present and the button still reads `Clear completed (1)`.
   - Click the button again, this time confirm OK. Confirm the task disappears from the list, the "Done" stat card drops to `0`, and the "Clear completed" button disappears from the header.
5. **Multi-completed check.**
   - Create three tasks and cycle each to `done` (two clicks per task). Cycle a fourth task only as far as `in-progress`.
   - Confirm the button reads `Clear completed (3)`.
   - Click it; confirm message reads `Delete 3 completed task(s)? This cannot be undone.`. Click OK.
   - Confirm exactly the three done tasks vanish and the `in-progress` task remains. The "Done" stat card reads `0`, "In Progress" reads `1`.
6. **Persistence check.** With at least one task still present, reload the page (`Ctrl+R` / `Cmd+R`). Confirm the remaining tasks are still there (this verifies the IndexedDB deletes committed correctly, not just the in-memory state).
7. **Console check.** Throughout the above, the browser DevTools console must show no errors. (Existing React 19 / Next 16 dev warnings unrelated to this change are acceptable; new errors are not.)

If any check fails, the failure is a defect in Task 1. Fix and re-run Tasks 1, 2, and 3 from the top.

There is no commit message for this task because no files change.

## Out of scope

The following are explicitly **not** part of this plan, in line with the issue body's "Scope: UI + client-side state only":

- No changes to `app/db.ts` (no new `deleteTasksBulk` API, even though one would be more efficient — the issue specifies "calling `db.deleteTask` for each").
- No changes to `app/types.ts`.
- No new component file under `app/components/`. The issue allows "at most one new helper file ... if it helps readability", but the handler is six lines and the button is four lines; extracting either would obscure rather than clarify. The plan keeps everything in `app/page.tsx`.
- No undo affordance. The `window.confirm` prompt is the entire safety mechanism, per the issue body.
- No keyboard shortcut, no toast notification, no animation on the bulk removal.
- No change to how the "Done" stat card is computed; it continues to reflect `tasks.filter((t) => t.status === "done").length` via the `stats` object at `app/page.tsx:153-158` and will update automatically once `setTasks` runs.
