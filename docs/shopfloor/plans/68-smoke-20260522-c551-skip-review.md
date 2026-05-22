# Plan: "Today" quick-filter for tasks list

Origin issue: [#68](https://github.com/niranjan94/shopfloor-smoke/issues/68) — classified `medium`.

This is a medium-flow plan (no design spec). Decisions below are derived from the issue body, the triage comment, and the existing code in `app/page.tsx`.

## Goal

Add a single "Today" toggle button to the tasks list filter panel that, when active, restricts the visible task list to tasks whose `createdAt` is within the last 24 hours (`Date.now() - 86_400_000`). The toggle composes with all existing filters (status, category, priority, search) — it is an additional AND-predicate in the existing `.filter()` chain, not a replacement for any filter.

## Design decisions

The triage comment named the shape; this plan pins down the open questions it called out (placement, styling, composition).

1. **State.** One new piece of React state in `app/page.tsx`:
   `const [filterToday, setFilterToday] = useState(false);`
   It is local UI state, not persisted to IndexedDB. Default is `false` (button starts inactive, list shows all tasks).
2. **Predicate.** A new line inside the existing `.filter()` callback in `app/page.tsx:131`, placed immediately after the `filterPriority` check and before the `searchQuery` check, with the literal form:
   `if (filterToday && Date.now() - new Date(t.createdAt).getTime() > 86_400_000) return false;`
   The 24-hour window is rolling (relative to the current `Date.now()`), not calendar-day-based, matching the issue text "created in the last 24 hours".
3. **Placement.** A new row inserted **above** the existing 4-column filter grid (`app/page.tsx:251`), still inside the existing filters `glass` container. The row holds a single button aligned to the left (so it does not stretch). The search input remains the topmost element in the filters panel; order top-to-bottom becomes: search input, "Today" toggle row, 4-column filter/sort grid.
4. **Styling.** Re-uses existing `.btn` classes — no new CSS. Active state: `className="btn btn-primary"`. Inactive state: `className="btn btn-ghost"`. The button text is the literal string `Today` (no icon, no count badge). Width is content-sized (no `width: 100%`).
5. **Composition with other filters.** Strict AND. When "Today" is active and (for example) `filterStatus` is `done`, only tasks completed in the last 24 hours that are also `done` show. When "Today" is active and no other filters narrow the list, only tasks created in the last 24 hours show. The empty-state copy at `app/page.tsx:285` already handles "No tasks match your filters." for this case — no change needed.
6. **Reset behavior.** None. The filter persists for the lifetime of the page mount, exactly like the other filter state variables in this file. There is no "Clear all filters" button to update.
7. **Out of scope.** No changes to `app/types.ts`, `app/db.ts`, `app/components/`, or any other route. No tests are added (the project has none — see CLAUDE.md "No tests"). No new CSS classes, no new dependencies.

## Testing strategy

The project has no automated test suite. CLAUDE.md states explicitly: *"No tests: this is a smoke test target, not a tested app. There is no test suite."* The available verification layers, taken from `package.json` `scripts` and CLAUDE.md, are:

| Layer | Command | Status for this plan |
| --- | --- | --- |
| Type check | `pnpm exec tsc --noEmit` | Required. Catches the new `useState<boolean>` and the predicate type. |
| Lint | `pnpm lint` | Required. Catches unused state, missing key, etc. |
| Production build | `pnpm build` | Required. Verifies Next.js compiles the changed page. |
| Unit tests | _none exist_ | Skipped — project has no unit test layer. Reason: CLAUDE.md "No tests". |
| Integration / e2e tests | _none exist_ | Skipped — project has no integration or e2e layer. Reason: CLAUDE.md "No tests". |
| Manual browser smoke | `pnpm dev` then load `http://localhost:3000` | Required. The only layer that exercises the new UI behavior. Checklist is enumerated inside Task 1. |

Because no automated layer can express "filter shows only tasks created in the last 24 hours", the TDD shape (write failing test → minimal change → green) is replaced by the **non-feature exception**: each implementation step is followed by the three automated checks (tsc, lint, build) and a fixed manual smoke checklist. This is the documented exception for projects with no testable surface for the changed behavior.

## Tasks

### Task 1 — Add `filterToday` state, predicate, and toggle button to the tasks page

**Exception applies:** project has no automated test layer that can express the new behavior. Steps 1–2 of the TDD shape (write failing test, confirm failure) are skipped per the testing-strategy section above. Verification is type-check + lint + build + the manual smoke checklist below.

**Affected files**

- Modify: `app/page.tsx`
- Create: _none_
- Test: _none_ (no test layer exists for this behavior — see "Testing strategy" above)

**Step 1 — Add state declaration.**

In `app/page.tsx`, immediately after the existing line:

```
const [sortBy, setSortBy] = useState<"created" | "dueDate" | "priority">("created");
```

(currently `app/page.tsx:46`), insert:

```
const [filterToday, setFilterToday] = useState(false);
```

The new line must sit between the `sortBy` declaration and the `loading` declaration so all filter/sort state stays grouped.

**Step 2 — Add predicate to the existing `.filter()` chain.**

In `app/page.tsx`, inside the `.filter((t) => { ... })` callback that currently begins at `app/page.tsx:131`, add one new line immediately after the existing line:

```
if (filterPriority !== "all" && t.priority !== filterPriority) return false;
```

The new line is exactly:

```
if (filterToday && Date.now() - new Date(t.createdAt).getTime() > 86_400_000) return false;
```

Do not reorder the existing predicates. Do not factor out the literal `86_400_000` into a named constant — keep it inline to match the local style of the file (no constants are extracted for the other filter predicates either).

**Step 3 — Add the toggle button row to the JSX.**

In `app/page.tsx`, inside the filters `glass` container that currently begins at `app/page.tsx:242`, locate the inner `<div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>` (currently `app/page.tsx:243`). Between the existing search `<input ... placeholder="Search tasks…" />` block (ends at `app/page.tsx:250`) and the existing `<div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem" }}>` filter-grid block (begins at `app/page.tsx:251`), insert this exact JSX:

```tsx
<div style={{ display: "flex", gap: "0.5rem" }}>
  <button
    className={`btn ${filterToday ? "btn-primary" : "btn-ghost"}`}
    onClick={() => setFilterToday((v) => !v)}
    aria-pressed={filterToday}
  >
    Today
  </button>
</div>
```

Notes for the implementer:

- The wrapping `<div>` is required so that future quick-filter buttons (out of scope here) can be added on the same row without restructuring.
- The button uses `aria-pressed` to expose its toggle state to assistive tech; this matches conventional toggle-button semantics and adds no dependency.
- Do not add an `onKeyDown` handler — the native `<button>` already handles Space/Enter activation.
- Do not change any other JSX in the filters panel.

**Step 4 — Run the automated checks.**

Run, in this order, from the repository root, and confirm each exits 0 with no new warnings:

```
pnpm exec tsc --noEmit
pnpm lint
pnpm build
```

Expected outputs:

- `tsc --noEmit`: no output, exit 0.
- `pnpm lint`: `✔ No ESLint warnings or errors` (or the project's equivalent clean line), exit 0.
- `pnpm build`: prints the Next.js build summary including a route entry for `/` and exits 0.

If any of these fail, fix the cause before continuing — do not commit a red tree.

**Step 5 — Manual smoke checklist.**

Start the dev server with `pnpm dev` and open `http://localhost:3000` in a browser. Run through the following nine checks in order. Each check must pass before the next. If any check fails, fix it and restart the checklist from check 1.

1. **Page loads.** The tasks page renders with the existing filters panel visible. The new "Today" button is visible immediately below the search input and above the four select dropdowns. No console errors.
2. **Initial inactive styling.** The "Today" button renders with `btn btn-ghost` styling (transparent background, gold border and text). `aria-pressed` is `false` (inspect via devtools).
3. **Initial behavior is no-op.** With the button inactive, the visible task list matches the list before this change — `filterToday=false` short-circuits the new predicate.
4. **Activation toggles styling.** Click the button. It re-renders with `btn btn-primary` styling (gold gradient background, dark text). `aria-pressed` becomes `true`.
5. **Activation filters list.** With the button active, only tasks whose `createdAt` is within the last 24 hours appear in the list. Tasks older than 24 hours disappear. The header count (`{filtered.length} {filtered.length === 1 ? "Task" : "Tasks"}`) updates accordingly.
6. **Empty state copy.** Activate "Today" in a state where no task qualifies. The list area shows the existing copy `No tasks match your filters.` (not the `No tasks yet.` copy — `tasks.length` is still non-zero).
7. **Composition with status filter.** With "Today" active, change `All Status` to `Done`. The list narrows to tasks that are both created in the last 24 hours AND have status `done`. Switch back to `All Status` and confirm the "Today"-only list returns.
8. **Composition with search.** With "Today" active, type a search query that matches a task older than 24 hours. That task must NOT appear (the AND with "Today" excludes it). Clear the search; the "Today" list returns.
9. **24-hour boundary.** Open browser devtools → Application → IndexedDB → `TodoApp` → `tasks`. Pick one task and edit its `createdAt` field to a timestamp exactly 23 hours 50 minutes in the past (ISO string). Reload the page. With "Today" active, the edited task appears. Then edit it again to 24 hours 10 minutes in the past, reload, and confirm with "Today" active the task disappears. This exercises the rolling-window boundary.

If all nine checks pass, the task is verified.

**Step 6 — Commit.**

Stage only `app/page.tsx` and commit with this exact Conventional Commits message:

```
feat(tasks): add "Today" quick-filter for tasks created in last 24h
```

Do not include any other files in this commit. Do not amend any prior commit.

## Out of scope / follow-ups

The following are explicitly **not** part of this plan. They are listed here so that a reviewer or implementer who feels tempted to add them knows to stop.

- A "Yesterday" / "This week" / custom-window quick-filter set.
- Persisting `filterToday` across reloads (e.g. via `localStorage` or the URL query string).
- A "Clear all filters" button.
- Automated tests for the predicate. This requires standing up a test runner (vitest or jest) which is a separate, larger change — out of scope for a medium-classified UI tweak.
- Tailwind utility-class refactor of the inline `style={{ ... }}` blocks.
- Internationalization of the literal string `Today`.

Each of the above, if wanted, should be filed as its own issue.
