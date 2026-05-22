# Plan — Issue #85: 'Today' quick-filter button on tasks list

## Context

The tasks home page (`app/page.tsx`) renders a filters bar with status, category, priority, and sort controls. Triage classified this issue as **medium**: there is no design spec — the plan is derived from the issue body and the triage comment.

Required behavior:

- Add a **Today** toggle button to the existing Filters section that, when active, filters the list to tasks whose `createdAt` is within the last 24 hours of `Date.now()`.
- The toggle is a client-only boolean piece of state; pressing it again clears it.
- The toggle composes with the existing status / category / priority / search filters (it is *additive* — all active filters must pass).
- The empty-state copy ("No tasks match your filters.") and the `{filtered.length} Tasks` heading must reflect the new predicate without extra changes (both already key off `filtered`).
- `Task.createdAt` is already an ISO string used by the "Newest first" sort at `app/page.tsx:150`, so `new Date(t.createdAt).getTime()` is the canonical way to read it.

All edits are localized to `app/page.tsx`. No schema changes, no new files, no new dependencies, no changes to `app/db.ts` or `app/types.ts`.

## Testing strategy

This project has no automated test suite (`CLAUDE.md` explicitly says "No tests"; `package.json` exposes only `dev`, `build`, `start`, `lint`; no `*.test.*` files exist). The verification layers available, and used by this plan, are:

- **Type check** — `pnpm exec tsc --noEmit` (runner: TypeScript compiler). Catches type regressions on the new state field and predicate.
- **Lint** — `pnpm lint` (runner: ESLint via `eslint-config-next`). Catches unused vars, hook misuse, and a11y warnings on the new button.
- **Production build** — `pnpm build` (runner: Next.js). Catches build-time errors the dev server may hide.
- **Manual dev-server smoke** — `pnpm dev`, then exercise the feature in a browser at `http://localhost:3000`. This is the only behavioral verification available; per `CLAUDE.md` the project relies on it.

Unit / integration / E2E layers are **skipped — not present in project**.

Every production-changing task below verifies against these four layers. Per the TDD shape exception, steps 1–4 (write failing test → confirm failure → minimum impl → confirm pass) are replaced by the manual smoke + type-check + lint + build sequence, since no automated test runner exists. Each task still ends with a Conventional Commits message.

## Tasks

### Task 1 — Add `filterToday` state and 24h predicate

**Files**

- Modify: `app/page.tsx`

**Change detail**

1. Add a new state hook immediately after the existing `searchQuery` declaration (currently `app/page.tsx:45`):

   ```tsx
   const [filterToday, setFilterToday] = useState(false);
   ```

   Place it on its own line, between the `searchQuery` and `sortBy` declarations so related filter state stays grouped.

2. Add a new predicate inside the existing `tasks.filter((t) => { … })` block at `app/page.tsx:131-139`. Insert it as the **last** predicate before `return true;`, so it composes with the existing filters and short-circuits correctly:

   ```tsx
   if (filterToday) {
     const cutoff = Date.now() - 24 * 60 * 60 * 1000;
     if (new Date(t.createdAt).getTime() < cutoff) return false;
   }
   ```

   Do **not** hoist `cutoff` out of the filter callback — re-computing it per render is intentional so that `Date.now()` is fresh on every render. Do not memoize.

3. Do not change the `sort` block, the `stats` block, or any other derivation.

**Verification (no test runner — manual layers only)**

- Run `pnpm exec tsc --noEmit`; expect zero errors. `filterToday` is `boolean`, `setFilterToday` is `Dispatch<SetStateAction<boolean>>`, and `new Date(t.createdAt).getTime()` already type-checks (used at line 150).
- Run `pnpm lint`; expect zero errors and zero warnings on `app/page.tsx`. In particular, `filterToday` must be read (it is — inside the predicate) so the `@typescript-eslint/no-unused-vars` rule does not fire.

**Commit**

```
feat(tasks): add filterToday state and 24h createdAt predicate
```

---

### Task 2 — Add the **Today** toggle button to the Filters section

**Files**

- Modify: `app/page.tsx`

**Change detail**

1. Locate the Filters block at `app/page.tsx:241-275`. The filters bar currently has a search `<input>` followed by a 4-column grid of four `<select>` controls (status, category, priority, sort).

2. Insert a new flex row **between** the search `<input>` (closes at line 250) and the `<div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", … }}>` opener (line 251). The new row is a single-row flex container holding the Today toggle button, so that the existing 4-column grid layout is untouched:

   ```tsx
   <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
     <button
       type="button"
       className={filterToday ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
       onClick={() => setFilterToday((v) => !v)}
       aria-pressed={filterToday}
       title="Show only tasks created in the last 24 hours"
     >
       Today
     </button>
   </div>
   ```

   Rationale for class choice: the existing codebase uses `btn-primary` for the active/affirmative state (see Add/Update at line 229) and `btn-ghost` / `btn-muted` for inactive secondary controls (see Edit at line 359). Using `btn-primary` when `filterToday` is true makes the active state visually unambiguous and matches the design language already in use; no new CSS is needed.

3. Do **not** add the button into the 4-column grid — keeping it on its own row preserves the existing dropdown layout on narrow viewports and matches the issue body's "two or three files" expectation that this is a small, localized change (in practice, one file).

**Verification**

- Run `pnpm exec tsc --noEmit`; expect zero errors. `aria-pressed` accepts `boolean` per React's DOM types.
- Run `pnpm lint`; expect zero errors and zero warnings. `type="button"` is set explicitly so the button cannot submit any ancestor form, which is also what every other `<button>` in this file effectively relies on.
- Run `pnpm build`; expect a successful production build with no new warnings on `app/page.tsx`.

**Commit**

```
feat(tasks): add Today quick-filter toggle button to filters bar
```

---

### Task 3 — Manual dev-server smoke check

This task verifies feature behavior end-to-end. It is **non-testable through code** (no automated UI test layer exists in the project), so per the testing-strategy exception it skips TDD steps 1–4 and is the only behavioral gate.

**Files**

- None modified.

**Steps**

1. Start the dev server: `pnpm dev`. Open `http://localhost:3000`.
2. If the task list is empty, add three tasks via the "New Task" form — title is enough; leave the other fields at their defaults. All three will have `createdAt` set to `new Date().toISOString()` at line 69, so they are all within the last 24 hours.
3. **Golden path — toggle on:** Click the **Today** button. Expected:
   - The button switches from the ghost style to the primary (gold) style.
   - `aria-pressed` flips to `true` (verify via DevTools → Elements).
   - The `{N} Tasks` heading and the rendered list still show all three tasks (they were just created).
4. **Golden path — toggle off:** Click **Today** again. Expected: button returns to ghost style, `aria-pressed="false"`, list is unchanged.
5. **Filter behavior — older task:** In DevTools → Application → IndexedDB → `TodoApp` → `tasks`, edit one task's `createdAt` to a timestamp older than 25 hours ago (e.g. `new Date(Date.now() - 25*60*60*1000).toISOString()`), then reload the page. Click **Today**. Expected: that task disappears from the list; the heading drops to `2 Tasks`. Toggle off; expected: it reappears.
6. **Composability:** With **Today** still active, also set the Status dropdown to `Done`. Expected: list shows only tasks that are both done **and** created in the last 24 hours. Reset status to `All Status`.
7. **Empty composability:** With **Today** active, set Status to `Done` when no done-tasks-from-today exist. Expected: the empty-state copy "No tasks match your filters." renders (current behavior at `app/page.tsx:285`); no new empty-state copy is needed.
8. **No regressions:** Toggle **Today** off, then exercise the search box, the three other filter dropdowns, the sort dropdown, the Add / Edit / Delete actions, and the status-cycle circle. Expected: all behave identically to before this change.

If any of steps 3–8 fail, stop and fix the failing task before committing.

**Commit**

No commit for this task — it is verification only. If a fix is required, fold it into a follow-up commit on Task 1 or Task 2 with a CC message of the form `fix(tasks): <what was wrong>`.

---

## Out of scope

- Changing `Task.createdAt`'s shape, indexing it in IndexedDB, or persisting filter state across reloads.
- Adding "Yesterday", "This week", or other date-range presets — the issue scopes the feature to a single 24-hour quick filter.
- Restyling the existing filter dropdowns or introducing a shared `<ToggleChip>` component. Three similar lines of inline styles would be a premature abstraction here; revisit if a second or third toggle is added later.
- Adding an automated test suite for this project. `CLAUDE.md` explicitly designates this app as a smoke-test target with no tests; introducing Jest / Vitest / Playwright is out of scope for this issue.
