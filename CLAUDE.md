# shopfloor-smoke

Smoke test target for [niranjan94/shopfloor](https://github.com/niranjan94/shopfloor). This app has no independent value.

## Commands

```bash
pnpm install       # install dependencies
pnpm dev           # dev server at http://localhost:3000
pnpm build         # production build
pnpm lint          # eslint
pnpm exec tsc      # type check
```

## Architecture

```
app/
  page.tsx          # tasks list (home) -- main feature page
  layout.tsx        # root layout, wraps everything in MainLayout
  db.ts             # IndexedDB wrapper (TodoApp database, v1)
  types.ts          # Task and Category interfaces
  components/
    MainLayout.tsx  # shell with sidebar + content area
    Sidebar.tsx     # nav links
  dashboard/        # stub page
  calendar/         # stub page
  projects/         # stub page
  settings/         # stub page
```

## Key Details

- **Storage**: client-side IndexedDB only -- no server, no API. `db.ts` is a singleton wrapper around the raw IDB API.
- **Stub pages**: dashboard, calendar, projects, settings exist as routes but have no real functionality. They're placeholders for smoke test coverage.
- **Categories**: seeded from `DEFAULT_CATEGORIES` in `page.tsx` on first load if IndexedDB is empty.
- **Status cycle**: todo -> in-progress -> done -> todo (cycled via the circle button on each task card).
- **No tests**: this is a smoke test target, not a tested app. There is no test suite.

## Gotchas

- `next.config.ts` is intentionally empty -- no customization needed.
- Tailwind v4 uses `@tailwindcss/postcss` instead of the traditional `tailwindcss` PostCSS plugin.
- All pages are client components (`"use client"`); SSR is not used.
