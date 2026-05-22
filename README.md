> **This repository exists solely to smoke test [niranjan94/shopfloor](https://github.com/niranjan94/shopfloor).
> The code here has no independent value. Do not use it as a reference or dependency.**

# shopfloor-smoke

A minimal Next.js task management app used as the target application for smoke testing [shopfloor](https://github.com/niranjan94/shopfloor).

## What's in here

- Task CRUD with status cycling (To Do / In Progress / Done)
- Filtering and sorting by status, category, and priority
- Dashboard, calendar, projects, and settings stub pages
- Client-side IndexedDB persistence via a thin `db.ts` wrapper
- Tailwind CSS v4 + Next.js 16 (App Router)

## Running locally

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Stack

| Layer    | Choice              |
|----------|---------------------|
| Framework | Next.js 16 (App Router) |
| UI       | React 19 + Tailwind CSS 4 |
| Storage  | IndexedDB (browser) |
| Language | TypeScript 5        |

<!-- last-smoke: 2026-05-22 -->
<!-- last-smoke: 2026-05-22 -->
