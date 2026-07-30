# codraft

A real-time collaborative workspace where your team and Claude turn conversation into a structured document — automatically.

## Quick start

1. Clone the repo
2. `cp .env.example .env.local` and fill in the values (see [Env vars](#env-vars))
3. Also copy the same values into `apps/web/.env.local` and `apps/web/.env` (Next.js reads `.env.local`, the Prisma CLI reads `.env`) and into `apps/server/.env`
4. `npm install` from the repo root — installs all workspaces (`apps/web`, `apps/server`, `packages/shared`)
5. `cd apps/web && npx prisma db push && npx prisma generate` — sync the schema to your database
6. `cd apps/server && npx prisma generate` — generate the server's own Prisma client
7. `npm run dev` from the repo root — starts both the Next.js frontend and the WebSocket server
8. Open http://localhost:3000

## Architecture

```
┌─────────────────────┐        ┌──────────────────────┐
│   apps/web (3000)   │◄──────►│  apps/server (3001)  │
│  Next.js App Router │  WS    │  Express + Socket.io  │
│  NextAuth v5         │        │  Yjs per-section docs │
│  REST API routes     │        │  Claude Haiku (chat)  │
└──────────┬───────────┘        └──────────┬────────────┘
           │                                │
           └────────────┬───────────────────┘
                         ▼
              PostgreSQL (Railway)
              Redis pub/sub (Upstash)
```

- **apps/web** — Next.js 14 App Router frontend. Owns auth, room/section CRUD via REST routes, and all pages.
- **apps/server** — a separate long-running Node process for real-time collaboration: Socket.io presence + chat, one Yjs `Y.Doc` per section for collaborative editing, and the Claude Haiku integration that drives chat responses and auto-extraction of decisions into sections.
- **packages/shared** — TypeScript types shared between both apps (`RoomTemplate`, `SectionData`, `ChatMessage`, etc.).

## Env vars

| Variable | Used by | Description |
|---|---|---|
| `AUTH_SECRET` | web | NextAuth session encryption secret |
| `NEXTAUTH_URL` | web | Canonical app URL for NextAuth callbacks |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | web | GitHub OAuth App credentials |
| `DATABASE_URL` | web, server | PostgreSQL connection string (Railway) |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | server | Upstash Redis REST credentials for multi-instance sync |
| `ANTHROPIC_API_KEY` | web, server | Claude API key — all calls use `claude-haiku-4-5-20251001` |
| `NEXT_PUBLIC_APP_URL` | web | Public frontend origin, used to build invite links |
| `NEXT_PUBLIC_WS_URL` | web | WebSocket server origin the browser connects to |
| `FRONTEND_URL` | server | Allowed CORS origin for the WebSocket server |
| `ADMIN_SECRET` | reserved | Not yet used |

## Deployment

- **Frontend** (`apps/web`) → Vercel
- **WebSocket server** (`apps/server`) → Railway, see `apps/server/railway.json` and `apps/server/Procfile`. `.github/workflows/deploy.yml` auto-deploys on push to `main` when `apps/server/**` changes (requires a `RAILWAY_TOKEN` repo secret).
- **Database** → Railway PostgreSQL
