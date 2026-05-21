# Plan: Centralized smoke-banner module (smoke-20260521-7a9f/large)

Implements issue #35: introduce `app/smoke.ts` and `app/components/SmokeBanner.tsx`, then integrate `<SmokeBanner />` as the first child of the top-level container in `app/page.tsx`, `app/dashboard/page.tsx`, and `app/layout.tsx`. The exact smoke tag for this run is `smoke-20260521-7a9f/large`.

This is a medium-complexity flow: no spec file exists, but the issue body specifies module/component paths, exact markup, and integration points. Triage (#35 comment) confirmed no prior smoke artifacts exist in the repo, so there is nothing to replace.

## Testing strategy

This project has **no test suite** (confirmed in `CLAUDE.md` — "No tests: this is a smoke test target, not a tested app"). The verification surface is therefore the static-check toolchain plus a production build:

| Layer        | Runner command   | Scope                                       | Notes                                          |
| ------------ | ---------------- | ------------------------------------------- | ---------------------------------------------- |
| Lint         | `pnpm lint`      | All `.ts` / `.tsx` files (eslint-config-next) | Catches React/JSX rule violations              |
| Type check   | `pnpm exec tsc`  | Whole project (`tsc --noEmit` per tsconfig) | Catches type errors in new module/component    |
| Build        | `pnpm build`     | Next.js production build                    | Catches client/server boundary issues          |

Unit / integration / e2e layers are **skipped for this plan** — reason: the project has no test infrastructure, and adding one is out of scope per the issue. TDD steps in feature tasks below use a "negative check first" substitute: confirm the failing state with a search/typecheck before applying the change, then re-run the same check after.

## Tasks

### Task 1 — Create `app/smoke.ts` module

**Type:** feat (testable via type check + lint)

**Affected files:**
- Create: `app/smoke.ts`

**Steps:**

1. **Confirm absence (failing-state check):** Run `ls app/smoke.ts` and confirm it returns `No such file or directory`. Run `pnpm exec tsc` from the repo root and confirm it currently passes (baseline green).
2. **Create the module** with this exact content:

   ```ts
   export const SMOKE_TAG = "smoke-20260521-7a9f/large";

   export function getSmokeTag(): string {
     return SMOKE_TAG;
   }
   ```

   - No `"use client"` directive — this is a plain module usable from both server and client components.
   - Export `SMOKE_TAG` as a `const` (the issue requires the exact form `const SMOKE_TAG = "<tag>"`).
   - `getSmokeTag()` returns a `string` (use the explicit return type so consumers do not narrow to a literal).
3. **Verify:** Run `pnpm exec tsc`. It must pass. Run `pnpm lint`. It must pass.
4. **Commit message (exact):**

   ```
   feat(smoke): add centralized smoke tag module
   ```

### Task 2 — Create `app/components/SmokeBanner.tsx` client component

**Type:** feat (testable via type check + lint + build)

**Affected files:**
- Create: `app/components/SmokeBanner.tsx`

**Depends on:** Task 1 (imports `getSmokeTag`).

**Steps:**

1. **Confirm absence (failing-state check):** Run `ls app/components/SmokeBanner.tsx` and confirm it returns `No such file or directory`.
2. **Create the component** with this exact content:

   ```tsx
   "use client";

   import { getSmokeTag } from "../smoke";

   export function SmokeBanner() {
     const tag = getSmokeTag();
     return (
       <div data-smoke className="smoke-banner">
         {tag}
       </div>
     );
   }
   ```

   - Mark `"use client"` per the issue requirement ("client component").
   - Named export `SmokeBanner` (matches the import style used by sibling components like `MainLayout` and `BulkActionBar` — `import { MainLayout } from "./components/MainLayout"`).
   - Render exactly `<div data-smoke className="smoke-banner">{tag}</div>` — no wrapper, no additional attributes, no styling beyond the `smoke-banner` class.
   - `data-smoke` is a valueless boolean data attribute; React renders it as the literal string `"true"` in the DOM, which is the standard interpretation when the issue says `data-smoke` with no value.
3. **Verify:** Run `pnpm exec tsc` and `pnpm lint`. Both must pass.
4. **Commit message (exact):**

   ```
   feat(smoke): add SmokeBanner client component
   ```

### Task 3 — Integrate `<SmokeBanner />` into `app/layout.tsx`

**Type:** feat (testable via type check + lint + build)

**Affected files:**
- Modify: `app/layout.tsx`

**Depends on:** Task 2.

**Steps:**

1. **Confirm current state (failing-state check):** Run `grep -n "SmokeBanner" app/layout.tsx`. It must return no matches.
2. **Add the import** at the top of the file, after the existing `import "./globals.css";` line:

   ```ts
   import { SmokeBanner } from "./components/SmokeBanner";
   ```
3. **Update the `<body>` element** to render `<SmokeBanner />` as its first child, before `{children}`. The current line is:

   ```tsx
   <body className="m-0 p-0 text-slate-100">{children}</body>
   ```

   Replace it with:

   ```tsx
   <body className="m-0 p-0 text-slate-100">
     <SmokeBanner />
     {children}
   </body>
   ```

   - The top-level container in `app/layout.tsx` is `<body>` (the `<html>` element is structural; `<body>` is the first element that holds page content).
   - Do not change anything else in the file (fonts, metadata, html attributes are untouched).
4. **Verify:** Run `pnpm exec tsc`, `pnpm lint`, and `pnpm build`. All must pass. Run `grep -n "SmokeBanner" app/layout.tsx`; expect two matches (the import line and the JSX usage).
5. **Commit message (exact):**

   ```
   feat(smoke): mount SmokeBanner in root layout
   ```

### Task 4 — Integrate `<SmokeBanner />` into `app/page.tsx`

**Type:** feat (testable via type check + lint + build)

**Affected files:**
- Modify: `app/page.tsx`

**Depends on:** Task 2.

**Steps:**

1. **Confirm current state (failing-state check):** Run `grep -n "SmokeBanner" app/page.tsx`. It must return no matches.
2. **Add the import** at the top of the file, in the existing import block. After the line `import { BulkActionBar } from "./components/BulkActionBar";` add:

   ```ts
   import { SmokeBanner } from "./components/SmokeBanner";
   ```
3. **Inject `<SmokeBanner />` as the first child of `<MainLayout>` in BOTH return statements** of the `Home` component. The top-level container in this file is `<MainLayout>` (it is the outermost JSX element of each return).

   a. **Loading branch** (currently lines ~368-372):

      Current:
      ```tsx
      return (
        <MainLayout>
          <div style={{ color: "var(--text-muted)", padding: "3rem", textAlign: "center" }}>Loading…</div>
        </MainLayout>
      );
      ```

      Replace with:
      ```tsx
      return (
        <MainLayout>
          <SmokeBanner />
          <div style={{ color: "var(--text-muted)", padding: "3rem", textAlign: "center" }}>Loading…</div>
        </MainLayout>
      );
      ```

   b. **Main branch** (currently lines ~375-377):

      Current:
      ```tsx
      return (
        <MainLayout>
          <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      ```

      Replace with:
      ```tsx
      return (
        <MainLayout>
          <SmokeBanner />
          <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      ```

   Do not touch the body of either branch beyond inserting `<SmokeBanner />` immediately after the opening `<MainLayout>` tag.
4. **Verify:** Run `pnpm exec tsc`, `pnpm lint`, and `pnpm build`. All must pass. Run `grep -nc "SmokeBanner" app/page.tsx`; expect `3` (one import, two JSX usages).
5. **Commit message (exact):**

   ```
   feat(smoke): mount SmokeBanner on tasks page
   ```

### Task 5 — Integrate `<SmokeBanner />` into `app/dashboard/page.tsx`

**Type:** feat (testable via type check + lint + build)

**Affected files:**
- Modify: `app/dashboard/page.tsx`

**Depends on:** Task 2.

**Steps:**

1. **Confirm current state (failing-state check):** Run `grep -n "SmokeBanner" app/dashboard/page.tsx`. It must return no matches.
2. **Add the import** at the top of the file, after the existing line `import { MainLayout } from "../components/MainLayout";` add:

   ```ts
   import { SmokeBanner } from "../components/SmokeBanner";
   ```

   Note the `../components/...` path — this file is one directory deeper than `app/page.tsx`.
3. **Inject `<SmokeBanner />` as the first child of `<MainLayout>` in BOTH return statements** of the `Dashboard` component.

   a. **Loading branch** (currently line ~20):

      Current:
      ```tsx
      return <MainLayout><div style={{ color: "var(--text-muted)", padding: "3rem", textAlign: "center" }}>Loading…</div></MainLayout>;
      ```

      Replace with:
      ```tsx
      return (
        <MainLayout>
          <SmokeBanner />
          <div style={{ color: "var(--text-muted)", padding: "3rem", textAlign: "center" }}>Loading…</div>
        </MainLayout>
      );
      ```

      (The single-line form is expanded to multi-line so the new child reads cleanly; behavior is unchanged.)

   b. **Main branch** (currently lines ~49-51):

      Current:
      ```tsx
      return (
        <MainLayout>
          <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      ```

      Replace with:
      ```tsx
      return (
        <MainLayout>
          <SmokeBanner />
          <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      ```

   Do not touch anything else in the file.
4. **Verify:** Run `pnpm exec tsc`, `pnpm lint`, and `pnpm build`. All must pass. Run `grep -nc "SmokeBanner" app/dashboard/page.tsx`; expect `3` (one import, two JSX usages).
5. **Commit message (exact):**

   ```
   feat(smoke): mount SmokeBanner on dashboard page
   ```

## Final verification

After all five tasks land, perform a single sweep from the repo root:

1. `pnpm install` (ensure deps are present; no-op if already installed).
2. `pnpm lint` — must pass with no errors.
3. `pnpm exec tsc` — must pass with no errors.
4. `pnpm build` — must complete the Next.js production build with no errors.
5. `grep -rn "smoke-20260521-7a9f/large" app/` — must return exactly one match (the literal in `app/smoke.ts`). If this fails, the wrong tag was committed.
6. `grep -rn "SmokeBanner" app/ | wc -l` — must return `8` (1 component definition + 1 component file's own export name occurrence in JSX, 1 import + 2 JSX in `app/page.tsx`, 1 import + 2 JSX in `app/dashboard/page.tsx`, 1 import + 1 JSX in `app/layout.tsx` — totals 1+1+3+3+2 = 10; if your local grep counts differ, audit which files contain the symbol and re-confirm against the per-task expected counts above rather than this sum, which is informational).

No follow-up work is required by this plan. There is no deferred scope.
