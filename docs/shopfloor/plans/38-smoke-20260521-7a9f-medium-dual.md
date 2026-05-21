# Plan: Dual smoke banner (`smoke-20260521-7a9f/medium`)

Implements issue [#38](https://github.com/niranjan94/shopfloor-smoke/issues/38). No design spec exists (medium-complexity flow); the design is derived directly from the issue body and the triage comment.

## Goal

Insert a small marker element `<aside data-smoke>smoke-20260521-7a9f/medium</aside>` as the first child of the top-level container in both `app/page.tsx` and `app/dashboard/page.tsx`. The text content must be exactly `smoke-20260521-7a9f/medium` (a literal forward slash, not an HTML entity, not split across nodes). If a prior `<aside data-smoke>...</aside>` element already exists at the top of either file, replace it in place rather than appending alongside it.

## Scope

- UI only.
- Two files: `app/page.tsx` and `app/dashboard/page.tsx`.
- No new components, no shared helper, no state, no styling. The marker is a plain inline JSX element rendered directly inside the existing top-level `<div className="animate-fade-in" ...>` of each page.

## Pre-implementation findings

- `app/page.tsx` line 377: top-level container is `<div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>`. Line 378 is currently blank. No existing `<aside data-smoke>` anywhere in the file.
- `app/dashboard/page.tsx` line 51: top-level container is `<div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>`. Line 52 starts the first existing child `<div>`. No existing `<aside data-smoke>` anywhere in the file.
- `rg "data-smoke" app/` returns no matches anywhere under `app/`, confirming the replacement branch will not fire for either file in this iteration. The plan still keeps the replacement language in the prose for completeness, but no replacement edit will actually run.

## Testing strategy

`CLAUDE.md` is explicit: this project has no test suite ("No tests: this is a smoke test target, not a tested app"). There are no `test/`, `tests/`, `spec/`, `__tests__/`, or `e2e/` directories, and `package.json` exposes only `dev`, `build`, `start`, and `lint` scripts. The applicable verification layers for a UI-only edit in this repo are therefore:

- **Lint** (`pnpm lint`) — flycatches JSX/TSX syntax errors and unused-symbol regressions.
- **Type-check** (`pnpm exec tsc --noEmit`, or `pnpm exec tsc` since the project's `tsconfig.json` already has `noEmit: true`) — confirms the new JSX is well-typed.
- **Production build** (`pnpm build`) — final compile-time gate; catches anything lint and tsc miss.

There is no unit, integration, or end-to-end test layer for this project. The standard five-step TDD shape ("write a failing test first") does not apply here because no test layer exists to host the test. Each task below therefore uses the **non-feature-task exception** documented in the plan-agent methodology and explicitly states which exception applies. The implementer MUST still run the three verification commands above after each production-code task and confirm they pass; that is the substitute for an automated test layer.

## Tasks

The implementer executes tasks in the order listed. Each task is atomic, declares its files, and ends with the exact Conventional Commits message to use.

### Task 1 — Add smoke marker to `app/page.tsx`

**Exception applies:** non-feature task (UI marker insertion into a project that has no test layer per the testing strategy above). Steps 1-2 of the TDD shape are skipped; verification is via lint, type-check, and build instead of an automated test.

**Affected files**

- Modify: `app/page.tsx`

**Change**

Inside the `return (...)` block of the default-exported `Home` component, locate the `<MainLayout>` element whose direct child is `<div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>` (line 377 at the time this plan was written). Insert the smoke-marker `<aside>` as the **first** JSX child of that `<div>`, immediately on the line after the opening tag and before the existing `{/* Header */}` comment / `<div>` block.

The literal JSX to insert (a single line, indented to match the surrounding two-level JSX indentation of eight spaces):

```tsx
        <aside data-smoke>smoke-20260521-7a9f/medium</aside>
```

Concretely, the post-edit region around line 377 must read:

```tsx
  return (
    <MainLayout>
      <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
        <aside data-smoke>smoke-20260521-7a9f/medium</aside>

        {/* Header */}
        <div>
          <h1>Tasks</h1>
```

Notes the implementer MUST honor:

- The text content must be the literal seven-character-then-slash-then-six-character string `smoke-20260521-7a9f/medium`. Do not HTML-encode the slash, do not insert curly-brace JSX expressions, do not break it across multiple text nodes.
- Do not add `className`, `style`, `id`, or any attribute other than `data-smoke`. `data-smoke` is a boolean-style data attribute and renders as `data-smoke=""` in the DOM, which matches the issue's literal markup.
- If, contrary to current findings, an `<aside data-smoke>...</aside>` element is already present at the top of the container, replace that single element in place (do not append a second one and do not leave stale text). Verify by `rg "data-smoke" app/page.tsx` before editing — should return zero matches in this iteration.
- Preserve the blank line that currently sits between line 377 and the `{/* Header */}` block: the new `<aside>` takes line 378, and the blank line moves down one position so the file remains visually grouped.

**Verification** (run from the repo root, in order; all three must exit zero before committing):

```bash
pnpm lint
pnpm exec tsc
pnpm build
```

Expected outputs:

- `pnpm lint` — no errors, no warnings introduced by this file. Exit code 0.
- `pnpm exec tsc` — no diagnostics. Exit code 0.
- `pnpm build` — Next.js build completes with `Compiled successfully` and emits the `/` route. Exit code 0.

Also confirm with `rg "data-smoke" app/page.tsx` that there is exactly one match in the file and its line reads `        <aside data-smoke>smoke-20260521-7a9f/medium</aside>`.

**Commit message** (verbatim):

```
feat(app): add smoke-20260521-7a9f/medium marker to tasks page
```

### Task 2 — Add smoke marker to `app/dashboard/page.tsx`

**Exception applies:** non-feature task (UI marker insertion into a project that has no test layer per the testing strategy above). Steps 1-2 of the TDD shape are skipped; verification is via lint, type-check, and build.

**Affected files**

- Modify: `app/dashboard/page.tsx`

**Change**

Inside the `return (...)` block of the default-exported `Dashboard` component, locate the `<MainLayout>` element whose direct child is `<div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>` (line 51 at the time this plan was written). Insert the smoke-marker `<aside>` as the **first** JSX child of that `<div>`, immediately on the line after the opening tag and before the existing first child `<div>` that wraps `<h1>Dashboard Overview</h1>`.

The literal JSX to insert (single line, indented to match the surrounding two-level JSX indentation of eight spaces):

```tsx
        <aside data-smoke>smoke-20260521-7a9f/medium</aside>
```

Concretely, the post-edit region around line 51 must read:

```tsx
  return (
    <MainLayout>
      <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
        <aside data-smoke>smoke-20260521-7a9f/medium</aside>
        <div>
          <h1>Dashboard Overview</h1>
          <p style={{ marginTop: "0.25rem", color: "var(--text-muted)", fontSize: "0.875rem" }}>
            Your productivity at a glance
          </p>
        </div>
```

Notes the implementer MUST honor:

- The text content must be the literal string `smoke-20260521-7a9f/medium`, identical to Task 1.
- Do not add any attribute other than `data-smoke`.
- The marker must be sibling-before the existing `<div><h1>Dashboard Overview</h1>…</div>` block, not nested inside it.
- If, contrary to current findings, an `<aside data-smoke>...</aside>` element is already present at the top of the container, replace that single element in place. Verify by `rg "data-smoke" app/dashboard/page.tsx` before editing — should return zero matches in this iteration.
- Do not introduce a blank line between the new `<aside>` and the subsequent `<div>` (the dashboard file does not use blank-line separators between sibling JSX blocks at this point, as shown in the surrounding context); matching the file's existing style.

**Verification** (run from the repo root, in order; all three must exit zero before committing):

```bash
pnpm lint
pnpm exec tsc
pnpm build
```

Expected outputs:

- `pnpm lint` — no errors, no warnings introduced by this file. Exit code 0.
- `pnpm exec tsc` — no diagnostics. Exit code 0.
- `pnpm build` — Next.js build completes with `Compiled successfully` and emits both `/` and `/dashboard` routes. Exit code 0.

Also confirm with `rg "data-smoke" app/dashboard/page.tsx` that there is exactly one match in the file and its line reads `        <aside data-smoke>smoke-20260521-7a9f/medium</aside>`. Confirm with `rg "data-smoke" app/` that there are now exactly two matches across the repo, one per modified file.

**Commit message** (verbatim):

```
feat(app): add smoke-20260521-7a9f/medium marker to dashboard page
```

## Out of scope (explicit non-goals)

- No extraction of the marker into a shared component or constant. The issue explicitly says "no new components"; two literal copies are correct.
- No CSS, no `hidden` attribute, no `aria-*` attributes. The marker is a plain DOM hook for smoke-test detection.
- No edits to `app/calendar/page.tsx`, `app/projects/page.tsx`, `app/settings/page.tsx`, or `app/layout.tsx`. The issue names only the two files above.
- No changes to package scripts, lint config, or TypeScript config.

## Acceptance checklist (for the implementer to self-verify before pushing)

- [ ] `rg "data-smoke" app/` returns exactly two matches: one in `app/page.tsx`, one in `app/dashboard/page.tsx`.
- [ ] Both matches are the exact line `        <aside data-smoke>smoke-20260521-7a9f/medium</aside>`.
- [ ] In each file, the `<aside>` is the first JSX child of the `<div className="animate-fade-in" ...>` container; no other element precedes it inside that container.
- [ ] `pnpm lint`, `pnpm exec tsc`, and `pnpm build` all exit zero.
- [ ] Exactly two commits exist on the implementation branch (one per task), each using the Conventional Commits message specified above verbatim.
