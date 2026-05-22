# Plan: Add "Today" quick-filter to the tasks list

Source issue: niranjan94/shopfloor-smoke#85

This is a medium-complexity change. No design spec was authored; this plan is derived directly from the issue body and triage classification comment. All work is localized to `app/page.tsx`. No schema changes, no new files, no changes to `app/types.ts` or `app/db.ts`.

## Scope

- Add client-side filter state `filterToday: boolean` (default `false`) to the `Home` component.
- Extend the existing `filtered` derivation (currently `app/page.tsx:130-151`) with an additional predicate: when `filterToday` is `true`, keep only tasks whose `createdAt` is within the last 24 hours (i.e. `Date.now() - new Date(t.createdAt).getTime() <= 24 * 60 * 60 * 1000`).
- Add a single toggle button labelled **Today** to the Filters section (the existing `glass`-styled filter card at `app/page.tsx:242-275`), placed on its own row above the existing 4-column select grid so the grid layout is not disturbed. The button reuses existing `btn` classes: `btn btn-primary` when active, `btn btn-ghost` when inactive, and carries `aria-pressed={filterToday}` for accessibility.

Out of scope:
- Any change to `Task.createdAt` semantics (it is already an ISO string; see `app/types.ts:9` and the existing sort at `app/page.tsx:150`).
- Persisting filter state across reloads. The other filter selects are session-local; the new toggle matches that.
- Showing a count or any indicator next to the button.

## Testing strategy

This project has **no test suite** (`CLAUDE.md` → "No tests: this is a smoke test target, not a tested app. There is no test suite."). The verification layers available to this plan are therefore:

- **Type check**: `pnpm exec tsc --noEmit` — run from the repo root. Must report no errors.
- **Lint**: `pnpm lint` — runs ESLint via `eslint-config-next`. Must report no errors.
- **Production build**: `pnpm build` — runs `next build`. Must complete without errors.
- **Manual browser smoke**: `pnpm dev` (serves at `http://localhost:3000`). Drive the feature through the golden path and the documented edge cases below.

Layers **skipped** for this plan, with reason:
- **Unit tests** — skipped: project has no unit test harness configured (no Jest, Vitest, etc. in `package.json`).
- **Integration tests** — skipped: same reason as unit tests.
- **E2E tests** — skipped: project has no E2E harness configured (no Playwright, Cypress, etc. in `package.json`).

Every feature task below verifies against the four available layers above. Because there is no automated test layer for new behavior, the manual browser smoke step is the **functional** verification; `tsc`/`lint`/`build` are correctness gates that catch regressions but do not exercise the behavior.

## Tasks

### Task 1 — Add `filterToday` state and 24h `createdAt` predicate

Adds client filter state and extends the existing `filtered` derivation. No UI change in this task; the toggle button is added in Task 2. Verification at this stage is correctness-only (type/lint/build) because the feature is not user-reachable until Task 2 lands.

Affected files:
- Modify: `app/page.tsx`

Steps:

1. Add a new `useState` declaration immediately after the existing `searchQuery` state on `app/page.tsx:45`:

   ```tsx
   const [filterToday, setFilterToday] = useState(false);
   ```

   Place the new line between the `searchQuery` state (line 45) and the `sortBy` state (line 46) so all filter state stays grouped together.

2. Extend the `.filter(...)` callback inside the `filtered` derivation at `app/page.tsx:131-140`. Insert a new predicate **immediately before** the `return true;` line so the new check runs after status/category/priority/search:

   ```tsx
   if (filterToday) {
     const cutoff = Date.now() - 24 * 60 * 60 * 1000;
     if (new Date(t.createdAt).getTime() < cutoff) return false;
   }
   ```

   Use strict `<` (not `<=`) so a task created exactly 24h ago is excluded, matching the natural reading of "last 24 hours".

3. Run `pnpm exec tsc --noEmit`. Expected: exits 0, no diagnostics.
4. Run `pnpm lint`. Expected: exits 0, no errors. (Warnings in pre-existing code are not a regression and may be ignored if present before the change; do not introduce new warnings.)
5. Run `pnpm build`. Expected: completes with `Compiled successfully` and exits 0.
6. Commit.

Note on the TDD shape: steps 1-2 (failing test) and step 4 (run, observe failure) are **skipped** for this task because the project has no test layer that could express this behavior — see the Testing strategy section above. The production change still ships with the four correctness verifications listed in steps 3-5.

Commit message (verbatim):

```
feat(tasks): add filterToday state and 24h createdAt predicate
```

### Task 2 — Add "Today" toggle button to the Filters bar

Adds the user-reachable UI for the filter introduced in Task 1.

Affected files:
- Modify: `app/page.tsx`

Steps:

1. In the Filters card (the `<div className="glass" style={{ padding: "1.25rem" }}>` block starting at `app/page.tsx:242`), the inner column wrapper at `app/page.tsx:243` contains the search input (line 244-250) followed by the 4-column select grid (line 251-273). Insert a new row **between the search input and the select grid**, i.e. after the closing `</input>` self-close on line 250 and before the `<div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", ...`. The new row holds the Today toggle on its own line, left-aligned, so the existing 4-column grid is undisturbed:

   ```tsx
   <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
     <button
       type="button"
       className={`btn btn-sm ${filterToday ? "btn-primary" : "btn-ghost"}`}
       aria-pressed={filterToday}
       onClick={() => setFilterToday((v) => !v)}
     >
       Today
     </button>
   </div>
   ```

   Notes on the choices made here, so the implementer does not second-guess them:
   - `type="button"` is required because the button lives inside the same form-ish container as other inputs; without it React/HTML would treat a stray click as form submit if a `<form>` is ever added.
   - `btn-sm` matches the existing small-button utility used elsewhere in the page (`app/page.tsx:359, 362`).
   - The `btn-primary` ↔ `btn-ghost` swap reuses utility classes that already exist in this project's stylesheet; do **not** introduce new CSS.
   - `aria-pressed` reflects the toggle state for screen readers; it is the standard ARIA pattern for a two-state toggle and is the only accessibility attribute required here.

2. Run `pnpm exec tsc --noEmit`. Expected: exits 0, no diagnostics.
3. Run `pnpm lint`. Expected: exits 0, no errors.
4. Run `pnpm build`. Expected: completes with `Compiled successfully` and exits 0.
5. Commit. The manual browser smoke is deferred to Task 3 so it can cover both the state and the UI together.

Note on the TDD shape: same as Task 1 — automated test layers are skipped because the project has no test harness; the four correctness verifications above stand in.

Commit message (verbatim):

```
feat(tasks): add Today quick-filter toggle button to filters bar
```

### Task 3 — Manual browser smoke

Functional verification of the feature end-to-end. This task is a **non-feature task** (verification only, no production change) and therefore skips the TDD shape steps 1-4 entirely — no test is written and no production code is modified. If a defect is found, file or fix it as a follow-up; do not bundle a fix into this task.

Affected files:
- None (verification only).

Steps:

1. Start the dev server: `pnpm dev`. Wait for the `Ready` line, then open `http://localhost:3000` in a browser.
2. Verify the **Today** button renders in the Filters card, on its own row directly below the search input and above the four select dropdowns. Its initial visual state must be the ghost (inactive) style.
3. **Golden path.** Create at least three tasks via the New Task form: leave the title as `"recent-a"`, `"recent-b"`, `"recent-c"`. All three will have `createdAt` set to "now" inside `handleSave` (see `app/page.tsx:69, 79`). Confirm all three appear in the list. Click **Today**. The button switches to the primary style and `aria-pressed` becomes `true` (verifiable via browser devtools Elements panel). All three tasks remain visible. Click **Today** again; the button returns to ghost style and the list is unchanged because all tasks are still recent.
4. **Edge case — older task is filtered out.** With **Today** inactive, open browser devtools → Application → IndexedDB → `TodoApp` → `tasks`. Pick one of the seeded tasks and edit its `createdAt` to an ISO timestamp older than 24 hours (e.g. `"2025-01-01T00:00:00.000Z"`). Reload the page. The edited task appears in the list. Activate **Today**: the edited task disappears; the other tasks remain. Deactivate **Today**: the edited task reappears.
5. **Edge case — combines with other filters.** Activate **Today**, then set the Status select to `Done`. The visible list must be the intersection (tasks created in the last 24h AND status `done`). Set Status back to `All Status`; toggle **Today** off. Confirm the list returns to the unfiltered set.
6. **Edge case — empty state.** Activate **Today** when no task is younger than 24h (use the IndexedDB edit from step 4 on every task, or simply delete all tasks and reload). The list area should show the existing "No tasks match your filters." message from `app/page.tsx:285`, not the "No tasks yet…" message. Confirm.
7. **Regression sweep.** Toggle each of the other filters (Status, Category, Priority, Sort) at least once with **Today** both on and off, and confirm no console errors appear in the browser devtools Console panel. Confirm the tasks Stats row at the top still reflects the **unfiltered** totals (the `stats` object at `app/page.tsx:153-158` reads from `tasks`, not `filtered`, and this must remain true).
8. Stop the dev server. Record the result of every step above in the PR description for Task 3's commit, in a bulleted "Manual smoke results" section.

Commit message (verbatim):

```
chore(tasks): manual smoke verification of Today quick-filter
```

(This commit will either be empty or include only the PR description update if changes were made elsewhere. If no files were modified, do not create the commit — the manual smoke results belong in the PR description, not in a git commit. In that case, skip the commit step and proceed directly to opening the pull request.)

## Review checklist for the implementer

Before opening the PR, the implementer must confirm:

- [ ] `app/page.tsx` is the only file modified across all three tasks.
- [ ] `filterToday` state is declared with `useState(false)` and is grouped with the other filter states.
- [ ] The 24h predicate uses `Date.now() - 24 * 60 * 60 * 1000` and strict `<` against `new Date(t.createdAt).getTime()`.
- [ ] The Today button uses `aria-pressed`, `type="button"`, and swaps between `btn-primary` and `btn-ghost`.
- [ ] No new CSS, no new dependencies, no changes to `app/types.ts` or `app/db.ts`.
- [ ] `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build` all exit clean on the final commit.
- [ ] Manual smoke steps 2-7 are recorded in the PR description.
