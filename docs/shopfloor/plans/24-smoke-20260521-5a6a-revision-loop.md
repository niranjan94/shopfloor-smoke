# Plan: Clear completed tasks button

Issue: [#24](https://github.com/niranjan94/shopfloor-smoke/issues/24) — smoke-20260521-5a6a/revision-loop

No design spec was produced for this issue (medium-complexity flow). Requirements are derived from the issue body and triage comment:

- Add a "Clear completed" button to the tasks list.
- The button calls `db.deleteTask` for every task with `status === "done"` and updates React state.
- Scope is UI + client-side state only. No schema changes.
- Allowed surface: `app/page.tsx` and at most one new helper file under `app/components/`.
- The button must be hidden when no completed tasks exist.
- The button must show a confirmation prompt (`window.confirm` is acceptable) before deleting.

Triage placement hints (verified against current `app/page.tsx`):

- Task list header is at `app/page.tsx:451-453`.
- `stats.done` is computed at `app/page.tsx:329` and gives the visibility condition.
- `handleDelete` at `app/page.tsx:189-194` shows the async/state-update idiom to follow.

## Testing strategy

This project explicitly opts out of automated tests (`CLAUDE.md`: "No tests: this is a smoke test target, not a tested app. There is no test suite."). There is no `test/`, `tests/`, `spec/`, `__tests__/`, or `e2e/` directory. `package.json` exposes no `test` script. The contributor instructions in `CLAUDE.md` list only `pnpm install`, `pnpm dev`, `pnpm build`, `pnpm lint`, and `pnpm exec tsc`. Introducing a unit/integration/e2e test layer here would violate the project's stated policy and is out of scope.

The layers that DO apply are static checks and manual smoke:

- **Type check** — `pnpm exec tsc` (per `CLAUDE.md`). Must pass with no errors.
- **Lint** — `pnpm lint` (per `CLAUDE.md`, runs `eslint`). Must pass.
- **Build** — `pnpm build`. Must succeed; surfaces production-only issues the dev server can hide.
- **Manual smoke via `pnpm dev`** — exercise on `http://localhost:3000`:
  1. With zero done tasks, confirm the "Clear completed" button is not rendered.
  2. Create three tasks; advance two through the status cycle to `done` (click the status circle three times each: todo → in-progress → done).
  3. Confirm the "Clear completed" button is now visible in the task list header next to the count.
  4. Click "Clear completed", cancel the `window.confirm` prompt — verify no tasks are removed and state is unchanged.
  5. Click "Clear completed" again and accept the confirm — verify both `done` tasks disappear from the list immediately, the "Done" stat card drops to `0`, and the button disappears.
  6. Reload the page and confirm the deleted tasks did not return (i.e. IndexedDB was updated, not just React state).

Because no automated test layer exists, the feature task in this plan invokes the **TDD exception for non-feature tasks** from the methodology: steps 1–4 of the TDD shape are skipped (no failing test to write). Verification is via `pnpm exec tsc` and `pnpm lint` per task, plus a final task that runs the full smoke pass above.

## Task list overview

| # | Task | Files | Commit type |
|---|------|-------|-------------|
| 1 | Add `handleClearCompleted` handler and conditional "Clear completed" button | `app/page.tsx` | `feat` |
| 2 | Verification — type check, lint, build, manual smoke | (none) | n/a |

---

## Task 1 — Add `handleClearCompleted` handler and conditional "Clear completed" button

**Affected files**
- Modify: `app/page.tsx`

**TDD exception:** no automated test layer exists in this project (per `CLAUDE.md`). Verify via `pnpm exec tsc` and `pnpm lint` at file scope. End-to-end behavior is verified in Task 2.

**Design decisions resolved here**

- **No new helper file.** The issue says "at most one new helper file under `app/components/` if it helps readability." The change is one async function (~10 lines) and one conditional button element (~8 lines). Extracting to a component would not improve readability and would add an import boundary for a single-use button. Keep everything in `app/page.tsx`.
- **Visibility condition.** Use `stats.done > 0` rather than recomputing. `stats.done` is already declared at `app/page.tsx:325-330` and is in scope at the header.
- **Confirmation copy.** `window.confirm` is explicitly allowed by the issue. Use a single short prompt that names the count, so the user knows the blast radius before accepting: `` `Clear ${stats.done} completed task${stats.done === 1 ? "" : "s"}?` ``.
- **Deletion order.** Use `Promise.all` over `tasks.filter((t) => t.status === "done").map((t) => db.deleteTask(t.id))`. Sequential `await` in a `for` loop also works but `Promise.all` keeps the handler short and matches no existing pattern strongly (the existing `handleDelete` is single-task, so there is no convention to break).
- **State update strategy.** After all deletes resolve, `setTasks((prev) => prev.filter((t) => t.status !== "done"))`. This mirrors the functional-update idiom used by every other handler in the file (`setTasks((prev) => prev.filter(...))` at line 192, `setTasks((prev) => prev.map(...))` elsewhere). Do not snapshot a `doneIds` array up front and use it in the filter — the functional update is simpler and re-reads current state, which is what every other handler in the file does.
- **Error handling.** Wrap the deletes in `try/catch` and `console.error(e)` on failure, matching the project's established pattern (every async handler in `app/page.tsx` uses exactly `} catch (e) { console.error(e); }`). If one delete fails, do not update React state — leaving the UI in sync with what is on disk is preferable to a partial optimistic update that could resurrect tasks on reload. (`Promise.all` rejects on the first failure, so a single `try/catch` is sufficient.)
- **Button styling.** Match the existing "Delete" task action button at `app/page.tsx:544-546`: `className="btn btn-danger btn-sm"`. This signals destructive intent and matches the project's class vocabulary (`btn-primary`, `btn-muted`, `btn-ghost`, `btn-danger`, `btn-sm` are already in use in this file).
- **Placement.** Inside the existing header `div` at `app/page.tsx:451-453`, as a second child of the flex row (the row already declares `justifyContent: "space-between"`, so the `h2` stays left and the button sits right).

**Steps**

1. Open `app/page.tsx`. Locate the existing `handleDelete` function at lines 189–194:

   ```tsx
   async function handleDelete(id: string) {
     try {
       await db.deleteTask(id);
       setTasks((prev) => prev.filter((t) => t.id !== id));
     } catch (e) { console.error(e); }
   }
   ```

2. Immediately after `handleDelete` (i.e. starting on the line after its closing `}`), insert a new async handler. The full text to insert:

   ```tsx
     async function handleClearCompleted() {
       const doneTasks = tasks.filter((t) => t.status === "done");
       if (doneTasks.length === 0) return;
       const ok = window.confirm(
         `Clear ${doneTasks.length} completed task${doneTasks.length === 1 ? "" : "s"}?`,
       );
       if (!ok) return;
       try {
         await Promise.all(doneTasks.map((t) => db.deleteTask(t.id)));
         setTasks((prev) => prev.filter((t) => t.status !== "done"));
       } catch (e) { console.error(e); }
     }
   ```

   Notes on this block:
   - The `doneTasks.length === 0` guard is defensive: the button itself is hidden when `stats.done === 0`, but `tasks` is the same source for both, so the guard cannot fire in normal use. It exists so the function is safe to call from any future code path.
   - The state update reads from `prev` rather than from the captured `doneTasks` so it is consistent with every other `setTasks` call in this file. Filtering by `t.status !== "done"` is correct because no `cycleStatus` interleaves with this handler (React state updates are synchronous within the handler).

3. Locate the task list header at `app/page.tsx:451-453`:

   ```tsx
           <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.875rem" }}>
             <h2>{filtered.length} {filtered.length === 1 ? "Task" : "Tasks"}</h2>
           </div>
   ```

4. Add the "Clear completed" button as a second child of that flex row, immediately after the `<h2>`. The resulting block must read exactly:

   ```tsx
           <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.875rem" }}>
             <h2>{filtered.length} {filtered.length === 1 ? "Task" : "Tasks"}</h2>
             {stats.done > 0 && (
               <button
                 className="btn btn-danger btn-sm"
                 onClick={handleClearCompleted}
               >
                 Clear completed
               </button>
             )}
           </div>
   ```

   - The button is rendered conditionally on `stats.done > 0`. When that count drops to zero (either by clearing or by un-cycling the last done task back to `todo`), the button unmounts on the next render.
   - The `onClick` passes the handler by reference; do not wrap in an arrow that calls it, to match the project's mixed convention where parameterless handlers are passed by reference (e.g. `onClick={handleSave}` at line 401, `onClick={resetForm}` at line 406) and parameterized ones are wrapped (e.g. `onClick={() => handleDelete(task.id)}` at line 544).

5. Run `pnpm exec tsc`. Expected output: exit code 0, no diagnostics. If TypeScript reports an unused symbol or implicit-any error, do not silence it — investigate; the changes above introduce no new types.

6. Run `pnpm lint`. Expected output: exit code 0. The project uses Next.js' default eslint config; the added code follows existing patterns and should not raise warnings.

7. Stage `app/page.tsx` only. Do not stage any other files. Commit with exactly:

   ```
   feat(tasks): add clear-completed button to tasks list
   ```

---

## Task 2 — Verification: type check, lint, build, manual smoke

**Affected files**
- (none — verification only)

**TDD exception:** verification task; no production changes.

**Steps**

1. From the repository root, run `pnpm install` if dependencies are not already installed (the implementer's fresh worktree may not have `node_modules`). Expected: exit code 0.

2. Run `pnpm exec tsc`. Expected: exit code 0, no diagnostics.

3. Run `pnpm lint`. Expected: exit code 0.

4. Run `pnpm build`. Expected: exit code 0; the Next.js build completes and reports `Compiled successfully`.

5. Run `pnpm dev`. Open `http://localhost:3000`. Execute the manual smoke pass enumerated in the **Testing strategy** section above (six numbered checks). All six must pass exactly as described. If any check fails, do not commit — return to Task 1 and diagnose.

6. Stop the dev server with `Ctrl+C`.

7. If all checks passed, this task produces no commit. The implementer should report success and finish the run.
