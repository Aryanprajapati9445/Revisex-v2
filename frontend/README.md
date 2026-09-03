# Frontend — College Notes Platform

React SPA for the API in [`../backend`](../backend/README.md).

## Setup

```bash
npm install
cp .env.example .env   # VITE_API_URL, defaults to http://localhost:4000
npm run dev            # http://localhost:5173
```

Port 5173 is already what the backend defaults `CORS_ORIGIN` to, so no backend
change is needed for local development.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm test` | Vitest + Testing Library + MSW |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm run build` | Typecheck then production build |

## Design system

Tokens in `src/index.css` are measured from notion.com — see `notion.com.md`
at the repo root. Two rules are easy to regress and matter most:

- **No borders.** Separation comes from `shadow-raised` / `shadow-floating`
  and the `background` / `surface` tint flip. shadcn primitives ship with
  `border` on; strip it when adding one.
- **The accent is rationed** to primary button fills and focus rings. Active
  nav uses a `surface` fill, not blue.
