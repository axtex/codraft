# codraft

Real-time collaborative workspace with group AI chat and structured sections.

## Rules

- Use `claude-haiku-4-5-20251001` for all Claude API calls in this repo (not the SDK's plain `claude-haiku-4-5` alias) — this is the pinned snapshot used throughout.
- Never call AI APIs (Claude, OpenAI) on file save, hot reload, or any dev-server watch trigger. AI calls happen only in response to explicit user actions (room creation, chat message, section fill request).
- TypeScript strict mode everywhere. No `any` types — use `unknown` + narrowing, or proper generics/interfaces.
- Mobile-first: design and implement components for small viewports first, then extend with `sm:`/`md:`/`lg:` breakpoints.
- After each task, report: what was built, what to check (manual test steps), and what comes next.
- Well-commented code throughout — but comments should explain *why*, not *what* (see general code style below).

## Stack

- Next.js 14 (App Router, TypeScript) — `apps/web`
- Node.js + Express + Socket.io — `apps/server`
- Yjs — CRDT, per-section real-time sync
- Tiptap — rich text editor with Yjs collaboration
- PostgreSQL + Prisma — persistence (Railway)
- Upstash Redis — pub/sub for multi-instance WS sync
- Claude Haiku (`claude-haiku-4-5-20251001`) — AI
- Railway — WebSocket server + PostgreSQL hosting
- Vercel — Next.js frontend hosting
- GitHub Actions — CI/CD

## Monorepo layout

```
/apps
  /web    — Next.js 14 frontend
  /server — Node.js WebSocket server
/packages
  /shared — shared TypeScript types
```

## Commands

- `npm run dev` (root) — runs web + server concurrently
- `npm run dev:web` / `npm run dev:server` — run individually
- `cd apps/web && npx prisma db push` — sync schema to DB
- `cd apps/web && npx prisma generate` — regenerate Prisma client
