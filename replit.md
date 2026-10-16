# S-MOVIE ORIGINAL

An Expo mobile app for discovering movies and series, managing a watchlist, and viewing title details, with a FastAPI backend.

## Run & Operate

- `pnpm --filter @workspace/s-movie run dev` — start the Expo app (managed workflow: `artifacts/s-movie: expo`)
- `uv run --frozen --project artifacts/api-server uvicorn app.main:app --host 0.0.0.0 --port $PORT` — run the FastAPI service (managed workflow: `artifacts/api-server: API Server`)
- `pnpm install --frozen-lockfile` — install JavaScript dependencies
- `uv sync --frozen --project artifacts/api-server` — install backend dependencies
- `pnpm --filter @workspace/s-movie run typecheck` — verify the mobile app and protected source locks
- Required environment: `DATABASE_URL`; `SESSION_SECRET` is used as the JWT signing fallback when `JWT_SECRET` is not set

## Stack

- pnpm workspaces, Node.js 24, TypeScript
- Mobile: Expo Router, React Native, React Query
- API: FastAPI, Python 3.12, SQLAlchemy async
- Data: PostgreSQL; Redis is optional and defaults to localhost

## Where things live

- `artifacts/s-movie/app/` — Expo Router screens
- `artifacts/s-movie/components/` and `lib/` — mobile components and app services
- `artifacts/api-server/app/` — FastAPI routes, schemas, database models, and services
- `artifacts/api-server/alembic/` — database migrations
- `artifacts/api-server/.env.example` — backend environment variable names

## Architecture decisions

- The repository's mobile source includes a verification script for protected home-feed and poster code; keep the protected files read-only.
- The workspace enforces a 24-hour package release age before installing new npm versions. Do not bypass that safeguard for newly released packages.

## Product

## Product

Movie and series discovery, search, title details, playback screens, watchlist, profiles, notifications, and account settings.

## User preferences

## User preferences

## Gotchas

## Gotchas

- Expo preview depends on Replit workflow-injected environment variables; use the managed `artifacts/s-movie: expo` workflow rather than starting Expo directly from a shell.
- The FastAPI backend expects a PostgreSQL `DATABASE_URL`; some endpoints also depend on configured Firebase, TMDB, and Redis services.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
