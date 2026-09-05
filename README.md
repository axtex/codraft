# codraft

**Think together. Build together.**

A room is a conversation and a document. You talk — Claude turns the decisions into structured sections as they happen.

**Live at:** [codraft-slate.vercel.app](https://codraft-slate.vercel.app)

---

## Why it exists

The useful part of planning a trip, running a meeting, or scoping a project happens in the conversation. The document is supposed to capture that — and usually doesn't. Someone is meant to "write it up" later; they drop context, the chat becomes the real source of truth, and the doc goes stale.

codraft treats the room as both surfaces at once. The team talks like they normally would. Claude sits in the room, extracts concrete decisions into named sections, and the document takes shape without a separate write-up step. You can still edit every section by hand.

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 (App Router, TypeScript), Tailwind, NextAuth v5 |
| Realtime | Node.js + Express + Socket.io |
| Collaboration | Yjs (one CRDT doc per section) + Tiptap |
| Persistence | PostgreSQL + Prisma (Railway) |
| Multi-instance sync | Upstash Redis pub/sub |
| AI | Claude Haiku (`claude-haiku-4-5-20251001`) |
| Hosting | Vercel (web), Railway (WebSocket server + Postgres) |
| CI | GitHub Actions → Railway on `apps/server` / `packages/shared` changes |

Monorepo: `apps/web`, `apps/server`, `packages/shared`.

---

## What it does

- **Rooms from templates** — Trip, Meeting, Project, Research, Brainstorm, or blank. Naming the room can auto-pick the closest template; you can override.
- **Group chat with Claude in the room** — streaming replies, `@Claude` / `@person` / `@Section` mentions, presence.
- **Structured sections** — collaborative rich text, status badges (`empty` → `in_progress` → `filled` / `human_edited`), reorder and delete.
- **Decision extraction** — casual chat is scanned for facts that belong in a section. Matches land as **suggestions** to accept or reject, not silent overwrites.
- **Ask Claude to fill** — generate a section from the conversation so far; the draft goes into the doc, not the thread.
- **Section history** — snapshots on human edits, Claude fills, accepted extractions, and reverts.
- **Sharing** — invite links, toggleable link-sharing, OWNER / EDITOR / VIEWER.
- **Export** — Markdown or PDF of the current sections.
- **Auth** — Google OAuth via NextAuth v5.

---

## Technical highlights

This is the part that is more than a chat UI with an LLM bolted on.

- **One Yjs `Y.Doc` per section, not per room.** Editing Hotels does not contend with Itinerary. The server hydrates each doc from `Section.yjsState` on join and fans binary updates over Socket.io (`yjs-update`).
- **Tiptap Collaboration binds to `Y.XmlFragment('default')`, not `Y.Text`.** Debounced persistence (5s) walks that XML to a plain-text `content` column so AI, export, and history see the same string the editor shows — without writing the DB on every keystroke.
- **Intent is classified, then extraction runs anyway.** A short Claude call labels each message `CHAT` / `WRITE:[section]` / `BOTH:[section]`. Fill-button phrasing (`fill the X section`) is matched with a regex first — the classifier often returned `CHAT` and skipped the write. A **second, independent** pass looks for extractable decisions and creates `ExtractionSuggestion` rows.
- **Claude never writes the live CRDT directly.** AI output is stored as markdown on the section; clients apply it on `section-updated`. Chat stays a conversation: WRITE/fill leaves an `EXTRACTION` pill (`Added to Hotels`) instead of dumping the draft into the thread.
- **AI only on explicit user actions** — room creation, a chat message, or a fill request. Nothing on save, hot reload, or a timer.
- **Pinned Haiku snapshot** — `claude-haiku-4-5-20251001` everywhere, never the floating `claude-haiku-4-5` alias.
- **Process split is forced by the host.** Vercel cannot hold Socket.io + in-memory Yjs. Next.js owns auth and REST; a long-running Express process on Railway owns presence, Yjs, and Claude. Next.js fans out section REST mutations via `POST /internal/section-update` with a shared `ADMIN_SECRET`.
- **Railway health is bound before Prisma/Socket.io.** `/` and `/health` return 200 as soon as `PORT` is listening so the edge does not sit on fallback 502s while the realtime stack boots.
- **Upstash Redis is best-effort.** REST `.publish()` / SSE `.psubscribe()` with Yjs updates as base64. Local single-instance dev does not need it; a Redis hiccup must not take down collaboration.
- **Shared types are vendored for deploy.** Railway's root is `apps/server`, so `@codraft/shared` is copied to `apps/server/vendor/shared` (`npm run sync:shared`) rather than resolved as a workspace package at runtime.
- **NextAuth is split for the Edge runtime.** `auth.config.ts` is Prisma-free (middleware); `auth.ts` has the adapter and JWT/DB callbacks.
- **PDF export folds Unicode to WinAnsi** so `pdf-lib` + StandardFonts do not throw on curly quotes and dashes.

---

## Design decisions

**The room is the unit, not the chat or the doc.** Landing copy and layout both insist on that: conversation left, sections right. If you only shipped a chatbot that "generated a doc" at the end, you'd still have the write-up problem.

**Suggestions over silent mutation.** Extraction is easy to get wrong (speculation, jokes, half-decisions). Pending suggestions keep humans as the authority on what enters the document.

**Templates exist so extraction has a target.** A blank page gives Claude nowhere obvious to put "budget is $3,000." Named sections (Hotels, Action Items, Key Findings) are the schema.

**Don't paste the document into the chat.** WRITE and fill generate markdown into the section and leave a one-line breadcrumb. EXTRACTION pills are styled as lasting history; SYSTEM messages were too easy to miss as ephemeral.

**Per-section CRDTs over one room-sized doc.** Sections are independently filled, collapsed, reordered, snapshotted, and exported. A single Yjs doc would couple their histories and make "Ask Claude to fill Hotels" a surgical edit of a shared tree.

**Mobile-first, then `sm:` / `md:` / `lg:`.** The split view is the product; it has to work as stacked panes before it is a desktop workspace.

**Strict TypeScript, no `any`.** Shared types in `packages/shared` are the contract between the two apps (`RoomTemplate`, `SectionData`, `ChatMessage`, `ExtractionSuggestion`).

---

## Architecture

```
┌─────────────────────┐        ┌──────────────────────┐
│   apps/web (3000)   │◄──────►│  apps/server (3001)  │
│  Next.js App Router │  WS    │  Express + Socket.io  │
│  NextAuth v5         │  REST  │  Yjs per-section docs │
│  REST API routes     │        │  Claude Haiku         │
└──────────┬───────────┘        └──────────┬────────────┘
           │                                │
           └────────────┬───────────────────┘
                         ▼
              PostgreSQL (Railway)
              Redis pub/sub (Upstash)
```

- **`apps/web`** — pages, Google auth, room/section CRUD, export, history. Deployed to Vercel.
- **`apps/server`** — Socket.io presence + chat, in-memory `Y.Doc`s, Claude chat/fill/extract, debounced Yjs → Postgres. Deployed to Railway (`apps/server/railway.json`). GitHub Actions deploys on push to `main` when server/shared change (`RAILWAY_TOKEN` repo secret).
- **`packages/shared`** — types only.

Production URLs: set `NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL` / `FRONTEND_URL` to the Vercel origin, and `NEXT_PUBLIC_WS_URL` / `WS_SERVER_URL` to the Railway origin. `NEXT_PUBLIC_*` is baked in at build time — change it, then redeploy.

---

## Getting started

1. Clone the repo
2. `cp .env.example .env.local` and fill in the values (see below)
3. Copy the same values into `apps/web/.env.local` and `apps/web/.env` (Next.js reads `.env.local`, the Prisma CLI reads `.env`) and into `apps/server/.env`
4. `npm install` from the repo root — installs all workspaces (`apps/web`, `apps/server`, `packages/shared`)
5. `cd apps/web && npx prisma db push && npx prisma generate`
6. `cd apps/server && npx prisma generate`
7. `npm run dev` from the repo root — starts Next.js and the WebSocket server
8. Open [http://localhost:3000](http://localhost:3000)

```bash
git clone https://github.com/axtex/codraft.git
cd codraft
cp .env.example .env.local
# then copy into apps/web/.env.local, apps/web/.env, apps/server/.env
npm install
(cd apps/web && npx prisma db push && npx prisma generate)
(cd apps/server && npx prisma generate)
npm run dev
```

### Env vars

| Variable | Used by | Description |
|---|---|---|
| `AUTH_SECRET` | web | NextAuth session encryption secret |
| `NEXTAUTH_URL` | web | Canonical app URL for NextAuth callbacks |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | web | Google OAuth credentials |
| `DATABASE_URL` | web, server | PostgreSQL connection string (Railway) |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | server | Upstash Redis REST credentials for multi-instance sync |
| `ANTHROPIC_API_KEY` | web, server | Claude API key — all calls use `claude-haiku-4-5-20251001` |
| `NEXT_PUBLIC_APP_URL` | web | Public frontend origin, used to build invite links |
| `NEXT_PUBLIC_WS_URL` | web | WebSocket server origin the browser connects to |
| `WS_SERVER_URL` | web | Server-side WS origin for internal APIs (falls back to `NEXT_PUBLIC_WS_URL`) |
| `FRONTEND_URL` | server | Allowed CORS origin for the WebSocket server |
| `ADMIN_SECRET` | web, server | Shared secret for `POST /internal/section-update` |

`npm run dev` runs web + server concurrently. `npm run dev:web` / `npm run dev:server` run them individually.

---
