# codraft — Interview Study Guide

**How to use this document:** Everything here is grounded in the repository as of the analysis date (patched to match code after an audit of README vs implementation). Claims are tagged:

- **VERIFIED FROM CODE** — observed in source files
- **INFERRED FROM CODE** — reasonably implied by the implementation, but not stated as a documented decision
- **NOT CLEAR / NEEDS MY CONFIRMATION** — you must fill this in from personal knowledge

If a "why" is not documented in code or comments, this guide says so. Do not invent a reason in interviews.

Git history: sole author `Avneet Thind` across all commits. LICENSE copyright 2026 Avneet Thind. Treat "I built this" as accurate unless you had uncommitted collaborators.

Live URL in README (`codraft-slate.vercel.app`) is **NOT VERIFIED FROM CODE** — confirm it still works before claiming it.

---

## 1. 30-Second Explanation

codraft is a real-time collaborative workspace where a room is both a group chat and a structured document. You talk with your team; Claude sits in the room, proposes decisions as accept/reject suggestions on named sections, and can fill a section from the thread when you ask. People can still edit every section by hand. I built it as a Next.js app for auth and REST, a long-running Express/Socket.io server for presence, Yjs collaboration, and Claude, and Postgres for persistence — because Vercel can't hold WebSockets and in-memory CRDT docs.

---

## 2. 1–2 Minute Project Explanation

**Problem.** Planning a trip, running a meeting, or scoping a project happens in conversation. The document that is supposed to capture that usually doesn't: someone is meant to write it up later, context gets dropped, and the chat becomes the real source of truth. **(This motivation is documented in README.md and landing copy in `apps/web/app/page.tsx`. Whether this was your original personal pain point: NOT CLEAR / NEEDS MY CONFIRMATION.)**

**Solution.** A room is two surfaces at once: chat on the left, structured sections on the right. Templates (Trip, Meeting, Project, Research, Brainstorm, or Custom — Overview + Notes, not an empty doc) give Claude named places to put facts. Casual chat is scanned for extractable decisions; those land as accept/reject suggestions rather than silent overwrites. You can also ask Claude to fill a section from the conversation so far. Humans edit via a Tiptap editor bound to a per-section Yjs CRDT.

**My role.** Sole author of the repo (git log). Built the Next.js frontend, Express/Socket.io realtime server, Prisma schema, Claude intent/fill/extraction pipeline, Yjs persistence, auth, sharing, export, and deploy config.

**Architecture.** npm workspaces monorepo: `apps/web` (Next.js 14 App Router, NextAuth v5 Google OAuth, REST API routes) deployed to Vercel; `apps/server` (Express + Socket.io, in-memory `Y.Doc`s, Claude Haiku, debounced Postgres writes) deployed to Railway; `packages/shared` (TypeScript types, vendored into the server for Railway). Both processes talk to the same PostgreSQL database. Revert fans out to live clients via `POST /internal/section-update` with a shared `ADMIN_SECRET`. Other REST mutations are broadcast by the browser over Socket.io after the write.

**Most important technical decisions (verified in code/comments):**
- One `Y.Doc` per section, not per room (`apps/server/src/room-state.ts`).
- Claude never writes the live CRDT; it writes markdown to `Section.content` and clients apply it with Tiptap `setContent` (`apps/server/src/ai-handler.ts`, `apps/web/components/room/SectionCard.tsx`).
- Intent classification and decision extraction are independent Claude calls, except `WRITE` returns before extraction (`handleMessage` in `ai-handler.ts`).
- Process split because Vercel cannot hold Socket.io + in-memory Yjs (documented in README; the split itself is verified by the two apps).
- Railway health endpoints bind before Prisma/Socket.io so the edge does not 502 during boot (`apps/server/src/index.ts`).

**Result.** A working product with Google auth, rooms, realtime chat, collaborative section editing, Claude fill/extract, history, invite links, and Markdown/PDF export. No automated tests exist. Redis pub/sub for multi-instance Yjs sync is only half-wired (publish exists; subscribe is never called). **User-facing metrics (users, rooms, latency): NOT CLEAR / NEEDS MY CONFIRMATION — do not invent numbers.**

---

## 3. What I Actually Built

Git shows one author. Treat every feature below as something you implemented unless you know otherwise.

### Rooms from templates

* **What it does:** Create a named room, auto-detect or pick a template, seed sections, always generate starter markdown via Claude (placeholder on API failure).
* **Where:** `apps/web/lib/templates.ts`, `apps/web/components/room/CreateRoomModal.tsx`, `apps/web/app/api/rooms/route.ts` `POST`, `apps/web/lib/ai-init.ts`
* **Details:** Templates are a `Record<RoomTemplate, { label, icon, sections[] }>`. `custom` is Overview + Notes, not empty. `detectTemplate(roomName)` is keyword matching (`trip`/`travel`/`vacation`, `meeting`/`standup`/`sync`, etc.). Room create: Prisma `room.create` with owner membership `OWNER`, then `Promise.all` of `section.create` (status `empty`), then **parallel** `generateSectionContent` Claude calls (not optional), then update `content` while keeping status `empty`. Comment in code: starter scaffolding is not a completed section. Slug: `@username/slugified-name` with `handleDuplicateSlug` appending `-2`, `-3`, …

### Google OAuth + session

* **What it does:** Sign in with Google; JWT session; username derived from email local-part for slugs.
* **Where:** `apps/web/auth.ts`, `apps/web/auth.config.ts`, `apps/web/middleware.ts`, `apps/web/app/api/auth/[...nextauth]/route.ts`, `apps/web/components/SignInButton.tsx`
* **Details:** NextAuth v5 beta. Edge-safe config without Prisma for middleware; full adapter + JWT callbacks in `auth.ts`. `allowDangerousEmailAccountLinking: true` because of a previous GitHub provider. Middleware matcher: `/dashboard/:path*`, `/room/:path*` only. API routes check `auth()` themselves.

### Dashboard

* **What it does:** List rooms you own or belong to; create, join, delete (owner only).
* **Where:** `apps/web/app/dashboard/page.tsx`, `dashboard-client.tsx`
* **Details:** Server component loads rooms with member avatars, filled-section counts (`filled` or `human_edited`), last message. Delete is `DELETE /api/rooms/[id]`. Join modal parses invite URL, path, or raw token.

### Group chat with Claude in the room

* **What it does:** Persist user messages, broadcast, run Claude, stream tokens, save AI replies.
* **Where:** `ChatPanel.tsx`, `MessageBubble.tsx`, `socket-handlers.ts` `send-message`, `ai-handler.ts` `handleMessage`
* **Details:** No optimistic UI — wait for `new-message`. Streaming via `ai-response-chunk`. Message types: `USER`, `AI`, `SYSTEM`, `EXTRACTION`. `SYSTEM` is rendered if present but **never created**. Mentions: `@Claude`, `@person`, `@Section` with autocomplete from **online** presence; notify uses `getOnlineMembers` and `includes` (substring). `@Claude` forces intent `CHAT` and **skips** the regex fill detector (see §12).

### Collaborative rich-text sections (Yjs + Tiptap)

* **What it does:** Multiple people edit the same section; updates fan out over Socket.io; debounce persist to Postgres.
* **Where:** `useYjsSection.ts`, `SectionCard.tsx`, `room-state.ts`, `socket-handlers.ts` `yjs-update`
* **Details:** Tiptap `Collaboration` binds to `Y.XmlFragment('default')`, not `Y.Text`. History extension disabled (`StarterKit.configure({ history: false })`) so ProseMirror undo does not fight Yjs. There is **no** `Y.UndoManager` — undo is not implemented. Remote updates tagged with origin `'remote'` to avoid echo. Server excludes sender on broadcast. Updates are JSON `number[]`, not binary frames. Debounce 5s. On last client leave, pending saves flush immediately (`deleteIfEmpty`).

### Decision extraction (suggestions)

* **What it does:** After a chat message, a second Claude call may create a pending `ExtractionSuggestion`. UI shows accept/reject; accept appends to section content.
* **Where:** `detectExtraction` in `ai-handler.ts`, `SectionsPanel.tsx` queue, `SectionCard.tsx` accept/reject, `apps/web/app/api/rooms/[id]/suggestions/route.ts`
* **Details:** One visible suggestion per section; extras queued. Accept: REST appends `\n\n` + suggestion, status `filled`, snapshot `extraction_accepted`, then client emits `accept-suggestion` which **updates the section again** on the socket server.

### Ask Claude to fill

* **What it does:** Generate markdown for one section from conversation; write to DB; chat gets an `EXTRACTION` pill `"Added to {section}"` instead of dumping the draft.
* **Where:** `fill-section` socket event, `handleFillSection`, `generateSectionMarkdown`, SectionCard "Ask Claude to fill" button
* **Details:** Status goes `in_progress` → `filled` (or revert to previous on failure). `max_tokens: 500`, prompt says max 200 words.

### Section history + revert

* **What it does:** Snapshots on human edit, Claude fill, accepted extraction, revert. Cap 20 per section. Revert restores content and notifies live clients.
* **Where:** `apps/web/lib/section-history.ts`, `apps/server/src/db-client.ts` `saveSnapshot` (duplicated), history/revert API routes, `SectionHistory.tsx`
* **Details:** Human-edit snapshots are debounced 1.5s on the client (`section-human-edit`) and skipped if the last snapshot is the same body with reason `user_edit`. Revert uses `notifySectionUpdated` (internal HTTP) so open editors pick up `section-updated`.

### Sharing

* **What it does:** Invite token URL `/join/{token}`; toggle `linkSharingEnabled`; new joiners get `EDITOR`.
* **Where:** `ShareModal.tsx`, `apps/web/app/api/join/[token]/route.ts`, `JoinRoomModal.tsx`, `apps/web/app/join/[token]/page.tsx`
* **Details:** Invite-only rooms reject *new* joins but existing members can still use the link. No UI exists to add a member without a link. `VIEWER` exists in shared types but is never assigned. Presence from `RoomManager` hardcodes `role: 'EDITOR'`. The first `presence-update` **replaces** the RSC member list with **online sockets only**, so Share modal / header avatars lose offline members and real DB roles.

### Export Markdown / PDF

* **What it does:** Download current sections as `.md` or `.pdf`.
* **Where:** `apps/web/app/api/rooms/[id]/export/route.ts`, `ExportButton.tsx`
* **Details:** Reads Postgres `Section.content`, not the live CRDT (up to ~5s stale vs typing). PDF via `pdf-lib` + Times Roman. `toWinAnsi` folds curly quotes/dashes so StandardFonts do not throw. No Unicode beyond a small fold map → `?`.

### Realtime presence, cursors, reconnect

* **What it does:** Online avatars, "X is editing" per section, reconnect banner.
* **Where:** `useSocket.ts`, `room-state.ts`, `cursor-update` in socket-handlers / SectionCard
* **Details:** Cursor colors from a fixed 8-color palette. Cursor presence times out after 5s without updates. Socket: polling then websocket, infinite reconnect, `withCredentials: false`. HTTPS pages rewrite `http://` WS URL to `https://`. Server emits `room-state`, `user-joined`, and `user-left`; the client **never listens** to those (only `presence-update` plus chat/section/Yjs events).

### Internal Next.js → WS fanout

* **What it does:** After REST writes (currently revert), tell the WS server to emit `section-updated`.
* **Where:** `apps/web/lib/ws-internal.ts`, `POST /internal/section-update` in `apps/server/src/index.ts`
* **Details:** Header `x-internal-secret` must equal `ADMIN_SECRET`. Best-effort: logs and continues if URL/secret missing.

---

## 4. Architecture

### Major components

```
Browser
  │  HTTPS (Vercel)
  ▼
apps/web  Next.js 14 App Router
  │  REST (same origin /api/*)
  │  Socket.io client  ──────────────►  apps/server  Express + Socket.io (Railway)
  │  POST /internal/section-update ──►  (ADMIN_SECRET)
  │
  └──────────────┬─────────────────────┘
                 ▼
         PostgreSQL (Railway)   ← both processes have their own PrismaClient
                 ▲
                 │  (optional, best-effort)
         Upstash Redis REST pub/sub  ← publish on yjs-update; subscribe NEVER called
```

**Frontend/backend boundary (VERIFIED):**
- Next.js owns: pages, Google auth, room/section CRUD, suggestions accept/reject, history, export, starter Claude calls on room/section create.
- Express owns: Socket.io, in-memory Y.Docs, presence, chat persistence from sockets, Claude chat/fill/extract, debounced Yjs → Postgres.
- Shared DB is the source of truth for rooms/members/messages/sections. Live CRDT state is in-memory on the WS process until debounce/flush.

**How they communicate:**
1. Browser ↔ Next.js: cookie session (JWT), `fetch` to `/api/...`
2. Browser ↔ WS server: Socket.io events (no cookies; `withCredentials: false`). Identity is whatever the client sends (`userId`, `userName`) — **no socket auth**.
3. Next.js → WS server: HTTP `POST /internal/section-update` (**revert only**; add/delete/reorder/accept are client socket emits after REST)
4. WS server → Anthropic: `@anthropic-ai/sdk` Messages API
5. Next.js → Anthropic: same SDK, only `generateSectionContent`

**Background/async:** No job queue. AI work is fire-and-forget from socket handlers (`.catch` log). Yjs saves are `setTimeout` 5s. Snapshot trim is inline after insert.

**External services (VERIFIED in env + code):**
| Service | Used by | How |
|---|---|---|
| Google OAuth | web | NextAuth Google provider |
| Anthropic Claude Haiku `claude-haiku-4-5-20251001` | web + server | Messages API create + stream |
| Railway PostgreSQL | web + server | `DATABASE_URL` via Prisma |
| Upstash Redis REST | server | `publish` only if env set |
| Vercel | web | README; **no `vercel.json` in repo** |
| Railway | server | `railway.json`, GitHub Actions `railway up` |
| GitHub Actions | server deploy | `.github/workflows/deploy.yml` (`RAILWAY_TOKEN` + `RAILWAY_PROJECT_ID`) |

`OPENAI_API_KEY` is in `.env.example` with comment "reserved, not currently called". **VERIFIED unused.**

`FRONTEND_URL` is documented as CORS origin. **VERIFIED unused** — CORS is `origin: true` (reflect any origin).

---

## 5. Repository Map

| Path | Purpose | Why it matters |
|---|---|---|
| `package.json` | npm workspaces + concurrent `dev` | How web+server start together |
| `packages/shared/src/types.ts` | Shared TS contract | Templates, statuses, message types, roles |
| `apps/web/prisma/schema.prisma` | Canonical-looking schema for web Prisma | Data model |
| `apps/server/prisma/schema.prisma` | Duplicate schema + `debian-openssl-3.0.x` binary | Must stay in sync; Railway Prisma engines |
| `apps/web/auth.ts` / `auth.config.ts` / `middleware.ts` | NextAuth split for Edge | Classic interview talking point |
| `apps/web/app/api/rooms/**` | REST for rooms/sections/history/export/suggestions | Authz lives here (unevenly) |
| `apps/web/app/api/join/[token]/route.ts` | Invite join | Link-sharing vs invite-only |
| `apps/web/app/room/[id]/page.tsx` | RSC loads room; membership gate | 404 if not member |
| `apps/web/app/room/[id]/room-workspace.tsx` | Split chat/sections UI | Product shell |
| `apps/web/components/room/SectionCard.tsx` | Tiptap + Yjs + suggestions | Hardest frontend file |
| `apps/web/hooks/useYjsSection.ts` | Client CRDT + echo prevention | Whiteboard this |
| `apps/web/hooks/useSocket.ts` | Socket.io client + TLS/localhost guards | Reconnect behavior |
| `apps/web/lib/markdown.ts` | Markdown → HTML for TipTap | Claude writes MD, editor needs HTML |
| `apps/web/lib/ai-init.ts` | Starter section content | Room-create Claude path |
| `apps/web/lib/ws-internal.ts` | Next → WS fanout | Cross-process live updates |
| `apps/server/src/index.ts` | Listen first, then Socket.io | Health vs 502 |
| `apps/server/src/socket-handlers.ts` | All realtime events | End-to-end workflows |
| `apps/server/src/ai-handler.ts` | Intent, fill, extract, stream | AI pipeline |
| `apps/server/src/room-state.ts` | In-memory rooms, Y.Docs, debounce | CRDT + presence |
| `apps/server/src/redis-sync.ts` | Upstash publish + unused subscribe | Incomplete multi-instance |
| `apps/server/src/db-client.ts` | Prisma helpers on server | Persistence from WS process |
| `apps/server/scripts/sync-shared.js` | Copy shared types into `vendor/` | Railway root = `apps/server` |
| `apps/server/scripts/start.cjs` | Find `dist/index.js` regardless of cwd | Avoid silent 502 crash loop |
| `apps/server/railway.json` | Nixpacks build + start command | Deploy shape |
| `.github/workflows/deploy.yml` | Deploy server on `main` path filters | CI for Railway only |
| `.env.example` | Required secrets | What exists vs what's unused |
| `README.md` | Product + architecture narrative | Claims to verify (see §21) |

Not important for interviews: `globals.css`, Tailwind config, landing `RoomPreview` (static mock), `useToast.tsx`.

---

## 6. End-to-End Workflows

### Workflow: Create a room

1. User opens `CreateRoomModal`, enters name; `detectTemplate` may preselect; user can override; chooses link sharing.
2. `POST /api/rooms` (`apps/web/app/api/rooms/route.ts`).
3. `auth()` — 401 if no session. Validates name. Builds `fullSlug` via `generateFullSlug` + `handleDuplicateSlug`.
4. `prisma.room.create` with `members.create` role `OWNER`.
5. Creates template sections in parallel (`status: 'empty'`).
6. `Promise.all(generateSectionContent)` — one Haiku call per section (`ai-init.ts`).
7. Updates each section's `content`; **status stays `empty`**.
8. Returns `{ room, inviteUrl, sections }`. Client `router.push(/room/${id})`.
9. Room page RSC (`app/room/[id]/page.tsx`) loads room if member; renders `RoomWorkspace`.
10. `useSocket` connects and emits `join-room`. Server hydrates in-memory Yjs, emits `room-state` (ignored by the client) and `presence-update` (used). The editor’s initial Yjs comes from the **RSC** `yjsState`, not from `room-state`.

**Cost/latency note (VERIFIED):** Trip template = 7 parallel Claude calls on create. Failure in one call falls back to `## {name}\n\n_Start writing here..._` and does not fail room creation.

### Workflow: Send a chat message (Claude in the loop)

1. User types in `ChatPanel`; Enter emits `send-message` (`roomId, message, userId, userName`).
2. Server `prisma.chatMessage.create` type `USER`; `io.to(roomId).emit('new-message')`.
3. Server loads last 20 messages + all sections.
4. Fire-and-forget `handleMessage(...)`.
5. `parseMentions` — `@claude`, `@SectionName`, `@userName` (substring includes, case-insensitive).
6. Notify mentioned users via `mentioned` to their socket IDs (`getSocketIdsForUser` — multi-tab). Only **currently online** members are eligible; names match with `includes`.
7. If `@Claude` → intent = `CHAT`. Else `detectIntent`: regex fill first, else Haiku classify (`CHAT` / `WRITE:X` / `BOTH:X`), `max_tokens: 20`.
8. If WRITE: `generateSectionMarkdown`, `writeAiContentToSection` (Postgres + snapshot `claude_fill` + `section-updated`), EXTRACTION chat pill, **return** (no chat stream).
9. Else: stream Haiku into `ai-response-chunk`; save `AI` message; emit `new-message`.
10. If BOTH: after chat, also fill the section as in step 8.
11. **Always** (unless WRITE returned early): `detectExtraction` — another Haiku call. If `EXTRACT:Section:content`, `createSuggestion` + `extraction-suggestion`.
12. Clients: `ChatPanel` appends messages / streams; `SectionsPanel` shows suggestion; `SectionCard` applies `section-updated` via `setContent(markdownToHtml(...))`.

### Workflow: Collaborative edit of a section

1. User types in Tiptap (`SectionCard`). Collaboration writes `Y.XmlFragment('default')`.
2. `ydoc.on('update')` in `useYjsSection` emits `yjs-update` unless origin is `'remote'`.
3. Server `Y.applyUpdate` on in-memory doc; `socket.to(roomId).emit('yjs-update')` (not back to sender); `publishSectionUpdate` (Redis, best-effort); `scheduleSectionSave` (5s debounce).
4. Other clients `Y.applyUpdate(..., 'remote')` — Tiptap updates.
5. If editor focused, `onUpdate` sets local status `human_edited`/`empty`, emits `cursor-update`, schedules `section-human-edit` at 1.5s.
6. `section-human-edit`: server reads plain text via `yXmlPlainText`, updates status/content/`updatedBy`, maybe `saveSnapshot` (`user_edit`), emits `section-status-update`.
7. Last client disconnect: `deleteIfEmpty` flushes pending timeouts then drops in-memory room.

### Workflow: Accept an extraction suggestion

1. `extraction-suggestion` arrives; `SectionsPanel` shows one per section (queue the rest).
2. User clicks check on `SectionCard`.
3. `POST /api/rooms/[id]/suggestions` with `suggestionId`. **Does not check room membership** (auth session only). Appends suggestion to `section.content`, status `filled`, `updatedBy: 'claude'`, suggestion `accepted`, snapshot `extraction_accepted`.
4. Client emits `accept-suggestion` with the **full appended body**.
5. Socket handler **updates the section again** (`content`, `filled`, `updatedBy: 'claude'`) and emits `section-updated` + `suggestion-resolved`.
6. All clients apply content to TipTap; pending UI clears; next queued suggestion promoted.

### Workflow: Join via invite link

1. User opens `/join/{token}` or pastes link in Join modal (`parseInviteToken` accepts full URL, `/join/...`, or raw token).
2. Client `GET /api/join/{token}`.
3. 404 if token unknown. 401 `{ requiresAuth: true }` → redirect to sign-in with `callbackUrl=/join/{token}`.
4. If not a member and `linkSharingEnabled === false` → 403.
5. If not a member and sharing on → `roomMember.create` role `EDITOR`. Existing members not downgraded.
6. Client `router.replace(/room/{roomId})`. Room page 404s if somehow not a member.

---

## 7. Technology Deep Dive

### Next.js 14 App Router

* **What:** React meta-framework; server components, route handlers, middleware.
* **Where:** `apps/web` — pages under `app/`, APIs under `app/api/`.
* **Problem it solves here:** SSR/auth-gated pages (dashboard, room) load Prisma data on the server; public landing is an RSC; REST colocated with the UI.
* **How used:** Room and dashboard are async server components calling `auth()` + `prisma`. Client islands (`RoomWorkspace`, modals) handle sockets. `middleware.ts` only runs on `/dashboard` and `/room`.
* **Concepts:** RSC vs client components, `params` in route handlers (Next 14 sync params, not the Next 15 promise style), `NEXT_PUBLIC_*` baked at build time (`useSocket`, invite URLs).
* **Alternatives:** Remix, Vite SPA + separate API, Next pages router.
* **Tradeoffs:** Vercel serverless cannot hold Socket.io/Yjs — forced process split. Build-time public env means WS URL mistakes need a full redeploy.

### NextAuth v5 (Auth.js)

* **What:** Auth library; Google provider + Prisma adapter + JWT sessions.
* **Where:** `auth.ts`, `auth.config.ts`, `middleware.ts`, `app/api/auth/[...nextauth]/route.ts`
* **Problem:** Google login and protected routes without rolling your own OAuth.
* **How:** Split config because Edge middleware cannot import Prisma. JWT strategy despite `Session` table existing (adapter still uses Account/User). Username written on first JWT callback. `SignInButton` uses client `signIn('google')` because server-action GET hits Auth.js `UnknownAction` (comment in file).
* **Concepts:** JWT vs database sessions, Edge runtime constraints, account linking, `trustHost`.
* **Alternatives:** Clerk, Lucia, custom OAuth.
* **Tradeoffs:** Beta (`5.0.0-beta.25`). `allowDangerousEmailAccountLinking` is a security tradeoff for migration from GitHub. JWT means `session.user.id` comes from token, not a DB hit on every request.

### Express + Socket.io

* **What:** Long-lived HTTP + WebSocket (and polling fallback) server.
* **Where:** `apps/server/src/index.ts`, `socket-handlers.ts`
* **Problem:** Presence, chat broadcast, Yjs updates as JSON `number[]`, streaming AI chunks — not a fit for serverless request/response.
* **How:** HTTP server listens on `0.0.0.0:$PORT` first; Socket.io attached asynchronously. CORS `origin: true`, `credentials: false`. Transports `polling` then `websocket`. Ping 25s / timeout 60s.
* **Concepts:** rooms (`socket.join(roomId)`), `socket.to` vs `io.to`, reconnect vs `join-room` on every connect.
* **Alternatives:** `ws` raw, PartyKit, Liveblocks, Ably, Supabase Realtime.
* **Tradeoffs:** You own scaling, auth on sockets (currently none), and sticky sessions if you add multiple instances.

### Yjs (CRDT)

* **What:** Conflict-free replicated data type; binary updates merge without a lock.
* **Where:** `room-state.ts`, `useYjsSection.ts`, `socket-handlers.ts`, `db-client.ts` `yjsState Bytes`
* **Problem:** Two people typing the same section without last-write-wins.
* **How:** One `Y.Doc` per section in a `Map` on the server. Clients each have a `Y.Doc`; Tiptap Collaboration binds to `XmlFragment('default')`. Updates sent as `number[]` over Socket.io (JSON, not binary frames). Persist `Y.encodeStateAsUpdate` to `Section.yjsState`. Plain text for AI/export/history is **walked from the XML tree** (`yXmlPlainText`) so saves don't wipe `content` with `''`.
* **Concepts:** CRDT commutative merge, update vs full state, transaction origin to prevent echo, why `Y.Text` ≠ TipTap's fragment.
* **Alternatives:** Automerge, OT (ShareDB), Liveblocks, one Y.Doc per room.
* **Tradeoffs:** Per-section docs isolate fill/reorder/history. More docs to hydrate on join. Server is a stateful replica — restart loses unsaved (sub-5s) edits unless flushed. No awareness protocol (you rolled cursors yourself).

### Tiptap

* **What:** ProseMirror-based React editor.
* **Where:** `SectionCard.tsx` — StarterKit (history off), Collaboration, Placeholder.
* **Problem:** Rich text UI on top of Yjs.
* **How:** `useEditor({ document: ydoc }, [ydoc])`. Seed markdown via `markdownToHtml` + `setContent` when no persisted Yjs state. Claude fills also `setContent` because server does not write the XmlFragment.
* **Concepts:** ProseMirror vs CRDT history; `immediatelyRender: false` (Next/SSR). Disabling PM history does **not** give you Yjs undo.
* **Alternatives:** Plate, Lexical, raw ProseMirror, Monaco (wrong for prose).
* **Tradeoffs:** `@tiptap/extension-collaboration-cursor` is in `package.json` but **unused**. Custom `cursor-update` instead. Markdown round-trip is lossy (subset parser). No `Y.UndoManager`. `nanoid` is also in `package.json` and unused (`slugify` is used on web only).

### PostgreSQL + Prisma

* **What:** Relational DB + type-safe ORM.
* **Where:** Two identical-ish schemas; `apps/web/lib/prisma.ts` (global singleton for HMR); `apps/server/src/db-client.ts` (plain client).
* **Problem:** Users, rooms, membership, chat, sections, snapshots, OAuth tables.
* **How:** `db push` in README (no migration folder in repo). Cascade deletes from Room. `yjsState Bytes` for CRDT blob. Dual PrismaClient processes → connection count = 2× pool.
* **Concepts:** adapter models for Auth.js, `onDelete: Cascade`, cuid IDs, unique `fullSlug` / `inviteToken`.
* **Alternatives:** Drizzle, raw SQL, Mongo for documents, separate Redis for Yjs blobs.
* **Tradeoffs:** Duplicate schemas can drift. Few indexes beyond uniques — chat-by-room is unindexed. No Prisma migrations checked in (**VERIFIED:** no `prisma/migrations` directory).

### Claude Haiku (Anthropic SDK)

* **What:** Fast/cheap chat model; pinned snapshot ID.
* **Where:** `ai-handler.ts`, `ai-init.ts`
* **Problem:** Classify intent, talk in chat, write section markdown, extract decisions, seed empty sections.
* **How:** `messages.create` and `messages.stream`. Structured-ish output via prompt conventions (`CHAT`, `WRITE:Name`, `EXTRACT:Name:content`, `NONE`) — **not** tool use / JSON schema API.
* **Concepts:** system vs user, `max_tokens` as cost/latency cap, streaming UX, prompt injection (section names in the prompt).
* **Alternatives:** GPT-4o-mini, Gemini Flash, local models, function calling.
* **Tradeoffs:** Pinned snapshot avoids alias drift (documented in `.claude/CLAUDE.md`). Haiku is cheaper/faster than Sonnet; quality of extraction is a product risk. Every user message can trigger 2+ API calls.

### Upstash Redis

* **What:** Redis-over-HTTP.
* **Where:** `redis-sync.ts`
* **Problem (intended):** Sync Yjs updates across multiple WS instances.
* **How:** `publish(section:{roomId}:{sectionId}, base64)`. `subscribeToRoom` uses `psubscribe` — **never called from anywhere else**.
* **Alternatives:** ioredis TCP, Redis Streams, NATS, don't multi-instance.
* **Tradeoffs:** REST/SSE subscribe is documented in-file as less battle-tested. Current single-instance Railway deploy may not need it. **Do not claim multi-instance sync works.**

### Railway + Vercel + GitHub Actions

* **What:** Split hosting.
* **Where:** `railway.json`, `deploy.yml`, README
* **Problem:** Serverless frontend vs long-lived WS.
* **How:** Actions: on push to `main` if `apps/server/**` or `packages/shared/**`, sync vendor, `railway up --ci --service codraft` with `RAILWAY_TOKEN` and `RAILWAY_PROJECT_ID`. Web: no Vercel config in repo — **INFERRED** Vercel Git integration. `start.cjs` searches multiple paths for `dist/index.js`. Server `dotenv` also loads `apps/web/.env.local` if present.
* **Tradeoffs:** Two bills, two env var sets, `NEXT_PUBLIC_WS_URL` must be the Railway HTTPS origin. Vendor copy of shared types.

### Tailwind CSS

* **Where:** `globals.css` design tokens. CLAUDE.md says mobile-first then `sm:`/`md:`/`lg:`. **VERIFIED:** layout uses `sm:` for the split; **no `md:`** in `apps/web`; `lg:` only on the landing H1.
* **Problem:** Consistent UI without a component library.
* **Tradeoffs:** Split view is `flex-col` on mobile, `sm:flex-row` on desktop (`room-workspace.tsx`).

---

## 8. Architecture Decisions — WHY

### Decision: Split Next.js (Vercel) and Express (Railway)

* **Chosen:** Two processes, shared Postgres.
* **Where:** `apps/web`, `apps/server`, README technical highlights.
* **Why:** README: "Process split is forced by the host. Vercel cannot hold Socket.io + in-memory Yjs." That is documented, not invented.
* **Alternatives:** Run Next.js custom server on Railway only; Fly.io; PartyKit; put Yjs in Redis and keep Vercel for HTTP only.
* **Tradeoffs:** Internal HTTP + `ADMIN_SECRET`; duplicated Prisma; two deploys; socket identity not tied to NextAuth cookie (`withCredentials: false` by design — comment in `useSocket.ts` about CORS reconnect loops).
* **Interview:** Explain serverless constraints, sticky in-memory state, and why auth cookies were not sent to the WS origin.

### Decision: One Y.Doc per section, not per room

* **Chosen:** `Map<sectionId, Y.Doc>` inside each room.
* **Where:** `room-state.ts` `getSectionDoc`; README.
* **Why:** README: sections independently filled, collapsed, reordered, snapshotted, exported; a single doc would couple histories and make "fill Hotels" a surgical edit of a shared tree. Also comments about TipTap fragment vs Y.Text.
* **Alternatives:** One room-sized Y.Doc with a map of fragments; OT; no CRDT (last write wins on `content` column).
* **Tradeoffs:** Isolation vs join-time hydration of every section (`join-room` loops all rows).
* **Interview:** CRDT granularity; contention; applying AI writes without merging into XML.

### Decision: Claude does not write the live CRDT

* **Chosen:** Update `Section.content` in Postgres; emit `section-updated`; clients `setContent(markdownToHtml(content))`.
* **Where:** `writeAiContentToSection`; comments in `ai-handler.ts` and `SectionCard.tsx`.
* **Why:** Documented: TipTap binds to `XmlFragment('default')`, not `Y.Text`. Server-side Y.Text writes would not show in the editor.
* **Alternatives:** Server applies XML updates; use `y-prosemirror` helpers; store markdown only and skip CRDT for AI fills.
* **Tradeoffs:** `setContent` can clobber in-flight collaborative edits. Dual sources of truth (`content` string vs `yjsState`) until debounce.
* **Interview:** Be honest that this is a known conflict window.

### Decision: Suggestions over silent mutation

* **Chosen:** `ExtractionSuggestion` rows, pending UI, human accept/reject.
* **Where:** schema, `detectExtraction`, `suggestions/route.ts`, README.
* **Why:** README: extraction is easy to get wrong (speculation, jokes, half-decisions). Code prompt: "Only extract clear, concrete decisions. Not questions or speculation."
* **Alternatives:** Auto-append; show a toast only; ask Claude to edit via tools.
* **Tradeoffs:** Extra click; suggestions can pile up (queue of one visible per section).

### Decision: Intent classify, then extract anyway

* **Chosen:** Two independent Haiku calls (plus maybe fill + stream).
* **Where:** `handleMessage` after chat/WRITE/BOTH.
* **Why:** README + comment: "a decision can surface in casual chat." Regex fill exists because "the classifier often returned CHAT and skipped the write."
* **Alternatives:** One prompt that both replies and extracts JSON; tool calling.
* **Tradeoffs:** Latency and cost per message; WRITE path returns before extraction (so WRITE messages do **not** also create suggestions — **VERIFIED** by the `return` after WRITE).

### Decision: Templates as the extraction schema

* **Chosen:** Named section lists per template.
* **Where:** `templates.ts`; README.
* **Why:** README: a page with no named sections gives Claude nowhere to put "budget is $3,000." `custom` still has Overview + Notes.
* **Alternatives:** Freeform tags; user-defined schema; embeddings into a vector store (**this project has no RAG/embeddings**).

### Decision: Pinned Haiku snapshot

* **Chosen:** `claude-haiku-4-5-20251001` everywhere, never `claude-haiku-4-5`.
* **Where:** `ai-handler.ts`, `ai-init.ts`, `.claude/CLAUDE.md`.
* **Why:** Documented as project convention to avoid alias drift.
* **Tradeoffs:** Must bump the ID manually when you want newer weights.

### Decision: NextAuth config split for Edge

* **Chosen:** `auth.config.ts` Prisma-free; `auth.ts` adapter + JWT DB work.
* **Where:** comments in those files; middleware imports only `auth.config`.
* **Why:** Documented: Edge cannot use Prisma.
* **Alternatives:** Don't use middleware; database sessions only on Node routes.
* **Tradeoffs:** Provider lists must stay identical (commented).

### Decision: Railway listen-before-Prisma

* **Chosen:** Register `/` and `/health`, `server.listen`, then dynamic `import('socket.io')`.
* **Where:** `index.ts` comments about fallback 502s.
* **Why:** Documented from production pain — **this is a real ops lesson, good interview story.** Confirm the 502 story with your memory: NEEDS MY CONFIRMATION on how painful it was, but the code/comments exist.

### Decision: Vendor `@codraft/shared` for Railway

* **Chosen:** `file:./vendor/shared` + `sync-shared.js`.
* **Where:** `apps/server/package.json`, `scripts/sync-shared.js`, CI step.
* **Why:** Documented: Railway root is `apps/server`, workspace package isn't on npm.
* **Alternatives:** Deploy from repo root; publish a private package; duplicate types by hand.

### Decision: JWT sessions + Prisma adapter

* **Chosen:** `session: { strategy: 'jwt' }` while still using `PrismaAdapter`.
* **Where:** `auth.ts`
* **Why this choice was made: not documented; user should determine the actual reason.** Common inference: JWT so middleware can authorize without a DB round trip. Mark as INFERRED if you say that.

### Decision: CORS `origin: true` and no socket cookies

* **Chosen:** Allow any origin; `withCredentials: false`.
* **Where:** `index.ts`, `useSocket.ts`
* **Why (partially documented):** Client comment: cookies + tight CORS allowlist caused production reconnect loops. Server still sets `origin: true` rather than `FRONTEND_URL`.
* **Why FRONTEND_URL unused: not documented as a conscious drop; could be leftover.** NEEDS MY CONFIRMATION.

---

## 9. Data Flow

**Enters the system:**
- Google profile (name, email, image) → User/Account
- Room name, template, linkSharing flag
- Chat strings (and client-supplied userId/userName on the socket)
- Tiptap/Yjs binary updates
- Suggestion accept/reject
- Export format query param
- Invite token
- Claude outputs (markdown, CHAT/WRITE/EXTRACT labels)

**Transformed:**
- Room name → slug + `@username/slug`
- Claude markdown → HTML (`markdownToHtml`) → TipTap/Yjs XML
- Yjs XML → plain text (`yXmlPlainText`) → `Section.content` + snapshots
- Chat → intent enum + optional section markdown + optional extraction
- PDF path: Unicode → WinAnsi fold → pdf-lib bytes

**Stored:** Postgres tables below. In-memory: `RoomManager.rooms` (clients, Y.Docs, save timeouts). Redis: ephemeral pub messages only (if configured).

**Leaves:** JSON APIs, Socket.io events, downloaded `.md`/`.pdf`, invite URLs, streamed AI tokens.

### Entities (Prisma)

```
User 1──* Account, Session
User 1──* Room (ownedRooms)
User *──* Room via RoomMember (role string: OWNER | EDITOR | default EDITOR)
Room 1──* Section 1──* SectionSnapshot
Room 1──* ChatMessage (userId nullable)
Section 1──* ExtractionSuggestion  (also stores roomId denormalized; NO Room relation)
```

`VerificationToken` — Auth.js leftover.

**Statuses (strings, not enums in DB):** Section `empty | in_progress | filled | human_edited`. Suggestion `pending | accepted | rejected`. Message `USER | AI | SYSTEM | EXTRACTION`.

**Relationships to remember:** Deleting a Room cascades members, messages, sections; sections cascade suggestions and snapshots.

---

## 10. APIs

Auth unless noted: NextAuth JWT via `auth()`. Socket events are **unauthenticated**.

### REST — Next.js

| Endpoint | Purpose | Request | Response | Authz | Logic | File |
|---|---|---|---|---|---|---|
| `GET/POST /api/auth/[...nextauth]` | OAuth | Auth.js | session/cookies | — | Google | `app/api/auth/[...nextauth]/route.ts` |
| `POST /api/rooms` | Create room | `{ name, template?, linkSharingEnabled? }` | `{ room, inviteUrl, sections }` | logged in | template, slugs, parallel Claude seed | `api/rooms/route.ts` |
| `GET /api/rooms` | List my rooms | — | `{ rooms }` | logged in | owner OR member; **UI unused** (dashboard is an RSC) | `api/rooms/route.ts` |
| `GET /api/rooms/[id]` | Room detail | — | `{ room }` | **member** | 401 if not member; **UI unused** (room page is an RSC) | `api/rooms/[id]/route.ts` |
| `PATCH /api/rooms/[id]` | Rename / link sharing | `{ name?, linkSharingEnabled? }` | `{ room }` | **owner** | | same |
| `DELETE /api/rooms/[id]` | Delete room | — | `{ success }` | **owner** | cascade | same |
| `POST /api/rooms/[id]/sections` | Add section | `{ name }` | `{ section }` | OWNER/EDITOR | max order+1, Claude seed | `sections/route.ts` |
| `PATCH /api/rooms/[id]/sections/[sectionId]` | Reorder **or** set content | `{ direction }` or `{ content }` | `{ sections }` or `{ section }` | OWNER/EDITOR | UI only sends `{ direction }` for reorder. `{ content }` exists but typing uses `section-human-edit` instead | `sections/[sectionId]/route.ts` |
| `DELETE .../sections/[sectionId]` | Delete section | — | `{ ok }` | OWNER/EDITOR | | same |
| `GET .../history` | Snapshots | — | `{ snapshots }` | any **member** | take 20 | `history/route.ts` |
| `POST .../history/revert` | Revert | `{ snapshotId }` | `{ section }` | OWNER/EDITOR | restore, snapshot revert, `notifySectionUpdated` | `history/revert/route.ts` |
| `POST /api/rooms/[id]/suggestions` | Accept | `{ suggestionId }` | `{ section }` | **any logged-in user** (no membership check) | append content | `suggestions/route.ts` |
| `DELETE /api/rooms/[id]/suggestions` | Reject | `{ suggestionId }` | `{ success }` | **any logged-in user**; **no roomId check** | status rejected | same |
| `GET /api/rooms/[id]/export?format=` | Export | `markdown` \| `pdf` | file | member | | `export/route.ts` |
| `GET /api/join/[token]` | Join | — | `{ roomId }` or errors | login required to join | EDITOR if new | `api/join/[token]/route.ts` |

### HTTP — Express

| Endpoint | Purpose | Auth | File |
|---|---|---|---|
| `GET /` `GET /health` | `{ status: 'ok' }` | none | `index.ts` |
| `POST /internal/section-update` | `{ roomId, sectionId, content }` → emit `section-updated` | `x-internal-secret` === `ADMIN_SECRET` | `index.ts` |

Internal handler **re-reads the section from DB** and emits that row; the `content` in the body is validated as a string but the emit uses DB state.

### Socket.io events

**Client → server:** `join-room`, `send-message`, `fill-section`, `yjs-update`, `section-human-edit`, `cursor-update`, `add-section`, `delete-section`, `reorder-sections`, `accept-suggestion`, `reject-suggestion`

**Server → client:** `room-state`, `user-joined`, `user-left`, `presence-update`, `new-message`, `ai-response-chunk`, `mentioned`, `section-updated`, `section-status-update`, `section-added`, `section-deleted`, `sections-reordered`, `extraction-suggestion`, `suggestion-resolved`, `yjs-update`, `cursor-update`

**Client actually listens to:** `presence-update`, `new-message`, `ai-response-chunk`, `mentioned`, `section-*`, `extraction-suggestion`, `suggestion-resolved`, `yjs-update`, `cursor-update`. **Never listens to:** `room-state`, `user-joined`, `user-left`.

`join-room` (server): hydrates in-memory Yjs from DB `yjsState`, emits `room-state` with last 50 messages + live Yjs encodings as `number[]`. The UI’s first paint uses the RSC payload instead. Late joiners therefore start from **DB** state, not from RAM (edits inside the 5s debounce window can be missed until a later `yjs-update`).

---

## 11. Database

**Engine:** PostgreSQL via Prisma. Provider URL `DATABASE_URL`. No checked-in migrations; README uses `prisma db push`.

**Indexes (VERIFIED):** Only `@@unique` — User.email, User.username, Account (provider, providerAccountId), Session.sessionToken, VerificationToken.token, Room.fullSlug, Room.inviteToken, RoomMember (roomId, userId). **No `@@index` on ChatMessage.roomId, Section.roomId, SectionSnapshot.sectionId, ExtractionSuggestion.roomId.**

**Important columns:**
- `Section.content` Text — what AI, export, history, and TipTap seed use
- `Section.yjsState` Bytes — CRDT blob
- `Section.status` string
- `Room.linkSharingEnabled` boolean default true
- `Room.inviteToken` unique cuid
- `ExtractionSuggestion.status` default `pending`
- `ChatMessage.userId` optional (Claude rows are null)

**Queries that matter:**
- Dashboard/list: rooms where owner OR membership, `updatedAt desc`, last 1 message, section statuses
- Join-room: all sections + last 50 messages
- Chat AI: last 20 messages
- Snapshots: newest 20; delete older by id list
- Reorder: load siblings ordered, swap two `order` ints in `$transaction`

**Vector search:** none.

**Caching:** none (no Redis cache, no HTTP cache headers beyond defaults). Prisma web client cached on `globalThis` in dev only.

**Why this way:** Relational model matches users/rooms/ACL. CRDT blob + parallel plain `content` is a dual-write so non-Yjs consumers (Claude, PDF) do not need to parse Yjs. **Whether you considered Mongo/Supabase: NEEDS MY CONFIRMATION.**

**Duplication:** `saveSnapshot` exists in both `apps/web/lib/section-history.ts` and `apps/server/src/db-client.ts` with the same 20-cap logic.

---

## 12. AI / LLM / RAG Deep Dive

This project is **not RAG**. No embeddings, no vector DB, no chunking, no retrieval index. Context is: section names + section `content` strings + last ~20 chat lines, stuffed into the system prompt.

### Models / API

- Package: `@anthropic-ai/sdk`
- Model: `claude-haiku-4-5-20251001`
- Auth: `ANTHROPIC_API_KEY`
- Triggers (**VERIFIED**, also a CLAUDE.md rule): room creation (per section), add custom section (one call), each chat message (intent ± stream ± fill ± extract), fill-section button. Not on save, timers, or hot reload.

### Call types

| Function | max_tokens | Stream? | Output convention |
|---|---|---|---|
| `generateSectionContent` (web) | 300 | no | markdown; fallback placeholder |
| `detectIntent` | 20 | no | `CHAT` / `WRITE:Name` / `BOTH:Name` |
| `detectExtraction` | 100 | no | `EXTRACT:Name:content` or `NONE` |
| `generateSectionMarkdown` | 500 | no | markdown only |
| main chat | 500 | **yes** | prose |

### Prompts (know these ideas, not every word)

- Intent: few-shot including "fill the Hotels section" → WRITE. Still skipped if message contains `@claude`.
- Extraction: "clear decision, fact, … not already there"; examples Shinjuku hotels, $3000 budget; questions/speculation → NONE.
- Fill: "Write clear markdown for the X section only… Max 200 words… no preamble."
- Chat: "AI collaborator in a team workspace"; under 200 words, or under 80 if ALSO writing a section; don't dump the draft into chat.
- Init: "brief starter… blanks for the team… max 100 words."

### Context construction

`buildSectionContext`: `[Name]: content or 'empty'`. Mentioned sections get a warning block. History: last 20, `Claude:` vs `userName:`.

### Tool calls / structured output

None. Parsing is `startsWith('WRITE:')` etc. Fragile if the model adds prose.

### Error handling

- `handleMessage` / `handleFillSection`: try/catch, log, restore `in_progress` section status.
- Socket layer: `.catch` so AI rejection does not crash Node (`uncaughtException` logger exists anyway).
- `generateSectionContent`: catch → placeholder markdown.

### Cost controls (what exists)

- Haiku not Sonnet
- `max_tokens` caps
- Chat history 20
- Fill prompt 200 words
- Init 100 words
- **No** rate limits, per-user quotas, caching of identical prompts, or stop-sequences beyond defaults

### Latency

- Room create: N parallel Haiku (N = section count)
- Each message: sequential intent (unless @Claude) → stream chat → maybe fill → extract. WRITE skips chat stream but still waits on fill.
- UI: `in_progress` badge; streaming chunks; no typing indicator for extraction.

### Hallucination / relevance

- Extraction is suggestion-gated (human in the loop) — main mitigation.
- Fill can overwrite section markdown via `setContent` (not a merge).
- Classifier regex is a patch for a known failure mode.
- Fuzzy section name match (`includes` both ways) can map to the wrong section.

### Trace: "Ask Claude to fill" on Hotels

1. `SectionCard` → `onAskClaude('Hotels')` → `socket.emit('fill-section', roomId, 'Hotels', userId, userName)`
2. `handleFillSection`: find section (exact then fuzzy)
3. emit `section-status-update` `in_progress`
4. `generateSectionMarkdown` with all sections + last 20 messages
5. `prisma.section.update` content/status/`updatedBy: 'claude'`
6. `saveSnapshot(..., 'claude', 'claude_fill')`
7. emit `section-updated`
8. emit `filled`; `saveMessage` EXTRACTION "Added to Hotels"; `new-message`
9. `SectionCard` effect: `markdownToHtml` → `editor.commands.setContent`
10. `ChatPanel` shows pill; click dispatches `codraft:scroll-to-section`

### Trace: User says "budget is $3000 total" (no @Claude)

1. Persist USER message, broadcast
2. `detectIntent` → likely `CHAT` (or BOTH:Budget if classifier says so)
3. Stream a chat reply
4. `detectExtraction` → `EXTRACT:Budget:Total budget: $3,000` (if Budget section exists)
5. `extraction-suggestion` → accept path appends rather than replacing

---

## 13. Real-Time / Concurrency Deep Dive

### Connections

Socket.io client: `io(NEXT_PUBLIC_WS_URL)`, path `/socket.io/`, transports polling→websocket, `reconnectionAttempts: Infinity`, delays 1s–8s, `timeout: 20000`, `withCredentials: false`. On `connect`, always `join-room` (covers reconnect). Server `allowEIO3: true`.

### Presence / state

`RoomManager`: `Map<roomId, { sections: Map<sectionId, Y.Doc>, clients: Map<socketId, ConnectedClient>, saveTimeouts }>`. Presence is **live sockets only**, not DB members. Multi-tab: one client entry per socket; `getSocketIdsForUser` finds all. Disconnect removes all joined rooms tracked on that socket (`joinedRooms` Set).

### CRDT sync

Not y-websocket. Custom:

```
local Tiptap → Y.Doc update → emit yjs-update [number[]]
server apply → broadcast to room except sender → Redis publish (optional)
other clients apply with origin 'remote' → skip re-emit
```

**No vector clock in your code** — Yjs handles that inside `applyUpdate`.

**Hydration race:** `join-room` applies DB `yjsState` onto whatever in-memory doc already exists on the **server**. Clients do not consume that live encode. A new tab hydrates from RSC/DB `yjsState`. Yjs `applyUpdate` of an older state onto a newer live **server** doc should merge, not rewind. If the room was evicted, the server hydrates from DB only (edits inside the 5s window after last leave are flushed in `deleteIfEmpty` — **VERIFIED intent**). If the process crashes before debounce, those edits are lost. A **late joiner** can miss RAM-only updates because `room-state` is ignored.

### Conflict resolution

- Concurrent typing: Yjs.
- Claude `setContent` vs live typing: **last client apply wins visually**; not CRDT-merged. Important whiteboard caveat.
- Reorder: optimistic swap, confirm via PATCH, then socket broadcast. Failure rolls back local state.
- Suggestions: one visible per section to reduce UI races; resolved id dropped from queue.

### Reconnection

UI banner + "Try reconnecting". On every `connect` (including reconnect), the client emits `join-room`. The server responds with `room-state` **and** `presence-update`. Local `Y.Doc` is **recreated only when `sectionId` changes**, not on socket reconnect (`useYjsSection`).

**VERIFIED:** the client never registers a `room-state` listener (`room-workspace.tsx` only handles `presence-update`). So reconnect does **not** resync Yjs encodings or the 50-message chat snapshot from the server. Missed **chat** while disconnected is also dropped. Subsequent `yjs-update` / `new-message` events still apply. Be honest about this in interviews.

### Persistence

5s debounce per section; flush on empty room. Human-edit metadata 1.5s + blur.

### Race conditions to know

1. Accept suggestion: REST write + socket write of the same content.
2. Claude fill vs human Yjs (setContent).
3. Dual `content` vs `yjsState` until save.
4. `add-section` socket is broadcast-only; persistence is REST. If REST succeeds and socket emit fails, other tabs miss the card until refresh.
5. Suggestions POST without membership check.
6. Socket `send-message` trusts client `userId`.
7. Late joiner / reconnect: ignored `room-state` means no catch-up snapshot for Yjs or chat.

### Scaling

In-memory maps ⇒ **one WS process** (or broken collaboration). Redis subscribe not wired. No sticky session config in repo. Horizontal scale would need: shared Yjs store or working pub/sub + don't apply DB state blindly, and socket auth.

---

## 14. Security

### Authentication

- Web pages `/dashboard`, `/room`: middleware JWT.
- `/join` is public; API enforces login.
- REST: `auth()` on most routes.
- **Sockets: none.** Knowing a `roomId` (cuid, not secret) is enough to join, read chat/Yjs, send messages as any userId, trigger Claude (API key on server).

### Authorization

- Room GET/export/history: membership.
- PATCH/DELETE room: owner.
- Section mutate: OWNER/EDITOR.
- **Suggestions accept/reject: any authenticated user.** Reject doesn't verify `params.id` matches the suggestion's room.
- VIEWER role unused; cannot actually enforce read-only in the editor or sockets.

### Secrets

`.env.example`: `AUTH_SECRET`, Google client id/secret, `DATABASE_URL`, Upstash, `ANTHROPIC_API_KEY`, `ADMIN_SECRET`, public URLs. `.gitignore` ignores `.env*`. `ADMIN_SECRET` comparison is string equality (timing: probably fine for this). If `ADMIN_SECRET` unset, internal route always 401.

### API keys

Anthropic key on **both** web and server. Room create burns tokens on Vercel serverless. No key restriction by referrer (it's server-side).

### User data

Chat, docs, emails, OAuth tokens in `Account`. Invite token is a capability URL — anyone with the link becomes EDITOR if sharing on.

### Input validation

Light: room/section name non-empty strings; export format whitelist; internal body type checks. **No length limits** on chat or section content. Mention matching is substring (`includes`) — `"@Ann"` could match `"Annie"`. YAML/HTML in markdown is escaped in `markdownToHtml` (`escapeHtml` first). Chat markdown is **not** a full sanitizer — no `dangerouslySetInnerHTML` for chat (React text/nodes). TipTap `setContent` HTML from your own converter.

### Database

Prisma parameterized queries. Cascade deletes. Duplicate slug loop is unbounded in theory (`while (true)` increment).

### Relevant vulnerability classes (based on this code)

1. **Missing socket authentication / spoofed userId**
2. **IDOR on suggestions**
3. **Insecure direct object if roomId leaks** (cuid vs invite token)
4. **Prompt injection** via chat into Claude (section overwrite / extraction spam)
5. **Cost DoS:** each message → multiple Haiku calls; no rate limit
6. **CORS reflect any origin** on WS HTTP (Socket.io still needs to connect; cookies not sent)
7. **Dangerous email account linking**
8. **Invite-only has no "add member" UI** — not a vuln, but sharing model is incomplete
9. **PDF/MD export** of whatever is in sections (no extra ACL)

### Reasonable improvements

- Authenticate sockets with a short-lived token from NextAuth (`getToken`)
- Check membership + role on every socket event
- Fix suggestion authz
- Rate-limit Claude
- Use `FRONTEND_URL` allowlist
- Rotate/limit invite tokens
- Implement VIEWER as read-only editor + socket ignore
- Don't trust client userName (use DB)

---

## 15. Testing

**Existing tests:** none. Zero `*.test.ts` / `*.spec.ts`. No Playwright/Jest config in app packages (Playwright appears only as a transitive lockfile dep). `npm test` is not defined.

**What is untested (high value):**
- `detectFillRequest` / `resolveSectionName` / `detectIntent` parsing
- `detectExtraction` parse of `EXTRACT:a:b:c` (first colon only — **VERIFIED**: `indexOf(':')` so extra colons stay in content)
- `yXmlPlainText` vs empty fragment wiping content (the bug they already commented about)
- `markdownToHtml` headings/lists/checklists
- `handleDuplicateSlug`
- `toWinAnsi` / PDF wrap
- Prisma membership authz
- Yjs echo origin `'remote'`
- WRITE early-return skipping extraction
- `@Claude` skipping fill regex

**Edge cases to be able to discuss:** empty Claude fill (`if (!content) revert status`); last client leave flush; reconnect Yjs gap; suggestion queue; reorder at list ends (`Cannot move further`); invite-only existing member; OAuth `OAuthAccountNotLinked`.

**What I would test next:** (1) `ai-handler` parsers with fixtures, (2) room membership matrix on REST, (3) a Socket.io integration test for yjs-update echo, (4) markdown converter snapshots.

---

## 16. Performance and Scalability

**Current considerations (VERIFIED):**
- Yjs persist debounce 5s
- Chat history 50 on join, 20 for AI
- Snapshot cap 20
- Parallel Claude on room create
- Streaming chat tokens
- Health listen-before-heavy-imports
- `keepAliveTimeout` 65s / `headersTimeout` 66s (proxy-friendly)

**Caching:** none.

**DB bottlenecks:** unindexed `chatMessage` by `roomId` + `createdAt`; join-room loads all sections including possibly large `yjsState`; dashboard loads all rooms with members; snapshot trim is findMany all ids then deleteMany.

**API/LLM latency:** dominant cost. Intent + chat stream + extract is serial. Room create waits for all section generations.

**Concurrency:** one Node event loop; AI calls don't block the socket handler (fire-and-forget) but still consume memory/handles. In-memory Y.Docs grow with active rooms.

**Network:** Yjs updates as JSON arrays of numbers (inefficient vs binary). Redis base64. Mixed polling/websocket.

**If usage grew 10x:**
- Add socket auth + membership (correctness before scale)
- Index `ChatMessage(roomId, createdAt)` and `Section(roomId, order)`
- Cap room create Claude (seed placeholders, generate async)
- Coalesce AI: don't extract on every message; debounce
- Don't send full `yjsState` for every section on every join if unchanged

**If 100x:**
- Cannot stay on one in-memory `RoomManager` — need a Yjs persistence service (Redis/Postgres document store) and **working** pub/sub or a CRDT-aware host (PartyKit, Liveblocks)
- Queue Claude (BullMQ) with per-room serialization to avoid stampeding fills
- Separate read replicas; connection pooling (PgBouncer) because two Prisma apps already
- CDN/static for landing; maybe edge for auth only
- Observability (none in repo beyond `console.log`)

---

## 17. Failure Modes

| What | Currently | Handling | Improve |
|---|---|---|---|
| Anthropic down / bad key | fill/chat/extract fail; init uses placeholder | try/catch + log; status revert | user-visible error in chat |
| WS server down | chat/collab dead; REST still works | reconnect UI | degrade to REST-only editing |
| Next.js down | no auth/REST/export; sockets might still run if already connected | — | |
| Postgres down | almost everything fails | Prisma throws; socket handlers log | |
| Redis down | publish catch-log; collab continues on one instance | documented best-effort | |
| Railway boot slow | historically 502 | health before Prisma | already mitigated |
| Wrong `NEXT_PUBLIC_WS_URL` | socket never connects; localhost guard logs error | | |
| Process crash mid-debounce | lose <5s Yjs | flush on graceful empty only, not SIGTERM | `SIGTERM` handler to flush all rooms |
| Claude empty fill | status restored | | |
| Classifier says CHAT on fill phrasing | regex patch | still skipped if `@Claude` present | run regex before @Claude short-circuit |
| `setContent` vs typing | possible overwrite | none | CRDT-aware apply |
| Uncaught exception | logged; process may still die depending on Node | `process.on` loggers | |
| Invite token leak | anyone joins as EDITOR | toggle invite-only (doesn't revoke token) | rotate token |

---

## 18. Technical Challenges

Do not invent "I struggled for two weeks." Use: implementation is in the repo; **personal lesson = NEEDS MY INPUT**.

### 1. TipTap Collaboration uses XmlFragment, not Y.Text

* **Problem:** Server/AI thought in strings; editor lives in XML. Naive `Y.Text` writes never appear.
* **Why hard:** Two persistence formats (`content` vs `yjsState`); walking XML for plain text; markdown→HTML seed.
* **Implementation:** `yXmlPlainText`, `markdownToHtml`, client `setContent` on `section-updated`.
* **Tradeoff:** Simpler AI path vs CRDT-unsafe applies.
* **Lesson:** NEEDS MY PERSONAL INPUT.

### 2. Intent classification missed "fill the X section"

* **Problem:** Comment: classifier returned CHAT and skipped write.
* **Why hard:** NL classification is lossy; UX button vs chat phrasing.
* **Implementation:** `detectFillRequest` regex before the Haiku call; separate `fill-section` event for the button.
* **Tradeoff:** Regex is brittle; `@Claude` still bypasses it.
* **Lesson:** NEEDS MY PERSONAL INPUT.

### 3. Hosting: Vercel vs Socket.io vs Railway 502s

* **Problem:** Serverless vs long-lived state; health check vs slow Prisma import; cwd/`dist` on Nixpacks.
* **Implementation:** process split, listen-first, `start.cjs`, vendor shared package, GHA deploy.
* **Tradeoff:** operational complexity.
* **Lesson:** NEEDS MY PERSONAL INPUT — but comments prove you hit 502s.

### 4. Dual process live updates

* **Problem:** REST revert/update must reach open sockets.
* **Implementation:** `ADMIN_SECRET` internal POST.
* **Tradeoff:** extra secret and failure mode (DB updated, UI stale).

### 5. Extraction quality vs silent writes

* **Problem:** Product trust.
* **Implementation:** pending suggestions + extra Haiku pass.
* **Tradeoff:** cost/latency vs control.

### 6. NextAuth Edge + Prisma + Google migration

* **Problem:** Middleware vs adapter; GitHub→Google linking; client `signIn` POST vs GET Configuration error.
* **Implementation:** split configs, `allowDangerousEmailAccountLinking`, SignInButton comment.
* **Lesson:** NEEDS MY PERSONAL INPUT.

---

## 19. What Could Be Improved

Prioritized by impact.

1. **Socket authentication and membership checks** — security; interviewers will poke this.
2. **Wire or remove Redis subscribe** — don't claim multi-instance sync.
3. **Suggestion IDOR + reject room scoping**
4. **Automated tests** on parsers, authz, Yjs echo
5. **Claude rate limits / queue** — cost DoS
6. **Reconnect / late join: actually listen to `room-state`** (Yjs + chat snapshot) or use y-websocket
7. **Claude fills via CRDT transactions** instead of `setContent`
8. **DB indexes** on hot queries
9. **Single `saveSnapshot` module** (shared package)
10. **Single Prisma schema** (generate from one)
11. **Implement or delete VIEWER**; presence should use DB roles
12. **Run fill regex even when `@Claude` is present**
13. **SIGTERM flush** of Yjs
14. **Use `FRONTEND_URL` CORS allowlist**
15. **Add-member UI** for invite-only rooms (UX)
16. **Observability:** structured logs, traces on Claude, health that checks DB
17. **Prisma migrations** instead of only `db push`
18. **Remove unused deps** (`@tiptap/extension-collaboration-cursor`, `nanoid` on both apps) and unused exports (`loadSectionState`, `getRoomCount`, `CursorInfo.position`, `OPENAI_API_KEY`, `FRONTEND_URL`)
19. **Binary Yjs over Socket.io** (Bytes, not `number[]`)
20. **Don't double-update on accept-suggestion**

---

## 20. Interview Questions

### Basic

1. **What is codraft?** — Testing: product clarity. Points: room = chat + doc, Claude proposes suggestions / fills on request, humans edit. Files: README, `page.tsx`.
2. **What is the stack?** — Next 14, Express/Socket.io, Yjs, Tiptap, Prisma/Postgres, Haiku, Vercel+Railway. Files: `package.json`s.
3. **Why two apps?** — Vercel can't hold WS + in-memory Yjs. Files: `apps/web`, `apps/server`, README.
4. **How does a user sign in?** — Google, NextAuth v5, JWT. Files: `auth.ts`, `SignInButton.tsx`.
5. **What is a template?** — Named section lists; keyword detect. File: `templates.ts`.
6. **Where is chat stored?** — `ChatMessage` in Postgres; last 50 on join. Files: schema, `getChatHistory`.
7. **What are section statuses?** — `empty | in_progress | filled | human_edited`. File: `packages/shared/src/types.ts`.
8. **How do you share a room?** — `inviteToken`, `linkSharingEnabled`. Files: join route, `ShareModal`.
9. **How do you export?** — GET export markdown/pdf. File: `export/route.ts`.
10. **Who wrote this?** — You (git). Don't claim a team.

### Intermediate

1. **Walk me through sending a message.** — §6 workflow. Files: `ChatPanel`, `socket-handlers`, `ai-handler`.
2. **How does collaborative editing work?** — Yjs per section, Socket.io, debounce. Files: `useYjsSection`, `room-state`.
3. **Why XmlFragment not Y.Text?** — Tiptap Collaboration. Files: `room-state.ts` comments, `SectionCard`.
4. **How do you prevent Yjs echo?** — origin `'remote'`; server `socket.to` not `io.to`. Files: `useYjsSection.ts`, `socket-handlers.ts`.
5. **What happens when the last user leaves?** — `deleteIfEmpty` flushes saves. File: `room-state.ts`.
6. **How does Next.js tell the WS server about a revert?** — `notifySectionUpdated`. Files: `ws-internal.ts`, `index.ts`.
7. **Why is NextAuth split into two files?** — Edge vs Prisma. Files: `auth.config.ts`, `middleware.ts`.
8. **How are usernames assigned?** — email local-part, collision suffix `id.slice(-4)`. File: `auth.ts`.
9. **How does invite-only work?** — reject new members, allow existing. File: `join/[token]/route.ts`.
10. **What is an EXTRACTION message?** — "Added to X" pill, not SYSTEM. Files: `ai-handler.ts`, `MessageBubble.tsx`.
11. **How is PDF Unicode handled?** — `toWinAnsi`. File: `export/route.ts`.
12. **How do you vendor shared types?** — `sync-shared.js`, `file:./vendor/shared`.
13. **What does GitHub Actions deploy?** — Railway server only, path-filtered. File: `deploy.yml`.
14. **How are snapshots capped?** — insert, list desc, delete overflow. File: `saveSnapshot`.
15. **Why fire-and-forget AI?** — comment: must not crash the handler. File: `socket-handlers.ts`.

### Deep Technical

1. **Draw the Yjs data path including persistence.** — encodeStateAsUpdate, Bytes column, yXmlPlainText.
2. **What breaks if two Railway replicas run?** — in-memory docs diverge; `subscribeToRoom` unused. File: `redis-sync.ts`.
3. **Why might reconnect miss updates?** — Client never listens to `room-state` (Yjs encodings + chat snapshot unused). File: `room-workspace.tsx`, `socket-handlers.ts` `join-room`.
4. **Claude fill vs concurrent typing.** — `setContent` vs CRDT. File: `SectionCard.tsx`.
5. **WRITE vs BOTH vs CHAT vs extract.** — control flow and the WRITE `return`. File: `handleMessage`.
6. **Why can `@Claude fill the Hotels section` fail to write?** — `@Claude` forces CHAT before regex. File: `handleMessage` + `detectIntent`.
7. **Accept-suggestion double write.** — REST then socket update. Files: suggestions route, `accept-suggestion` handler.
8. **How would you authenticate Socket.io with this NextAuth setup?** — JWT, not cookies (CORS history). Files: `useSocket.ts`, `auth.ts`.
9. **Prisma from two Node processes.** — two pools, duplicate schema, openssl binaryTargets on server.
10. **Join-room applies DB yjsState onto a live doc.** — CRDT merge vs rewind; when room was empty vs not.
11. **Suggestion queue algorithm.** — one per section, `promoteNext`. File: `SectionsPanel.tsx`.
12. **markdownToHtml threat model.** — escape then re-tag. File: `markdown.ts`.
13. **Internal route emits DB row not body content.** — stale if update not committed yet? Revert updates first then notify — order is OK.
14. **No Prisma migrations.** — `db push` drift across environments.
15. **Event loop: many parallel Haiku on room create.** — serverless timeout risk on Vercel for trip template (7 calls). File: `api/rooms/route.ts`.

### Design / Scalability

1. **Why not one Y.Doc per room?** — README rationale; isolation vs complexity.
2. **How would you scale to 10k concurrent rooms?** — don't store Y.Docs only in RAM; persist every update or use a collab service.
3. **Where does this system bottleneck first?** — Anthropic + single WS process, not Postgres.
4. **Design rate limiting for Claude.** — per room, per user, queue, cheaper classify model.
5. **Would you put chat in Redis?** — currently Postgres; trade durability vs speed.
6. **How to make VIEWER real?** — DB role on socket join; Tiptap editable false; ignore yjs-update from viewers.
7. **Replace Socket.io with Liveblocks?** — trade control/cost; you'd delete a lot of `room-state`.
8. **Multi-region?** — Yjs + single writer is hard; affinity or CRDT store.
9. **How to evolve extraction to tools/JSON schema?** — less brittle than `EXTRACT:` prefix.
10. **Cost if every message hits 3 Haiku calls at 10 msg/s.** — back-of-envelope; debounce extract.

### AI-specific

1. **Is this RAG?** — No. Prompt stuffing of sections + recent chat.
2. **How do you control hallucinations entering the doc?** — suggestions; fill still trusted.
3. **Why pinned model IDs?** — alias drift. File: CLAUDE.md.
4. **What's the intent prompt's failure mode?** — CHAT when user wanted WRITE; regex patch.
5. **How would you add citations to section fills?** — not implemented; would need prompt + UI.
6. **Token budget of `buildSectionContext` as sections grow?** — unbounded string; truncation missing.
7. **Streaming UX vs persisting AI message.** — chunks then `new-message` replaces; `ChatPanel` clears stream on AI type.
8. **Could prompt injection overwrite another section?** — fill uses resolved name; extract uses model-chosen name with exact match required (`toLowerCase` equality, **no fuzzy on extract match** — **VERIFIED** `sections.find` exact lower). Fuzzy is for fill/intent resolve.

### Real-time / distributed systems

1. **Explain CRDTs vs OT using this codebase.** — Yjs updates commute; you still have non-CRDT `setContent`.
2. **What is a transaction origin for?** — ignore remote updates when emitting.
3. **Sticky sessions: do you need them?** — yes if multiple nodes without shared Yjs; currently one node.
4. **Pub/sub payload format.** — base64 because REST JSON. File: `redis-sync.ts`.
5. **Presence correctness with two tabs.** — two socketIds, one userId; colors may differ per tab (`addClient` per socket).
6. **Cursor timeout 5s.** — not a CRDT awareness protocol. File: `SectionCard.tsx`.
7. **Ordering of `new-message` vs `ai-response-chunk`.** — chunks first, then persisted message; duplicate risk if id mismatch — they key by message.id.
8. **Network partition between two editors.** — Yjs merges on reconnect **if** updates flow; your reconnect gap may drop.
9. **Debounce vs durability.** — 5s RPO on crash.
10. **Why polling first?** — comment: Railway proxy websocket upgrade 502. File: `useSocket.ts`.

---

## 21. Resume Bullet Verification

README / CLAUDE.md claims:

| Claim | Verdict | Notes |
|---|---|---|
| Live at codraft-slate.vercel.app | **NOT VERIFIED** | Not in code; check the URL before listing it |
| Next.js 14 App Router, TS, Tailwind, NextAuth v5 | **VERIFIED** | `apps/web/package.json` |
| Node + Express + Socket.io | **VERIFIED** | |
| Yjs one doc per section + Tiptap | **VERIFIED** | Collaboration cursor package unused |
| PostgreSQL + Prisma on Railway | **VERIFIED** schema/env; Railway host **INFERRED** from README/railway.json |
| Upstash Redis pub/sub multi-instance sync | **PARTIALLY VERIFIED** | Publish implemented; subscribe never used; optional env |
| Claude Haiku pinned snapshot | **VERIFIED** | |
| Vercel web + Railway WS | **PARTIALLY VERIFIED** | Railway config in repo; Vercel has no config file |
| GHA deploys server on path filters | **VERIFIED** | Also needs `RAILWAY_PROJECT_ID`, not only `RAILWAY_TOKEN`. Does not test or deploy web |
| Rooms from templates + auto-detect | **VERIFIED** | Custom = Overview + Notes, not empty |
| Group chat, streaming, @mentions, presence | **VERIFIED** | Presence is online sockets only after first `presence-update`; roles always `EDITOR` from RoomManager |
| Section status badges, reorder, delete | **VERIFIED** | |
| Extraction as suggestions not silent overwrite | **VERIFIED** | WRITE fills the section and skips extraction |
| Ask Claude to fill → doc not thread | **VERIFIED** | Button = `fill-section` event, not the chat regex |
| Section history snapshots + revert | **VERIFIED** | |
| Sharing invite links, toggle, OWNER/EDITOR/VIEWER | **PARTIALLY VERIFIED** | VIEWER never assigned; no manual add-member; presence overwrites roles **and** drops offline members |
| Export MD/PDF | **VERIFIED** | Uses DB `content`, not live CRDT; PDF Unicode limited |
| Google OAuth | **VERIFIED** | Previously GitHub (comments) |
| Claude never writes live CRDT | **VERIFIED** | |
| AI only on explicit user actions | **VERIFIED** | Includes add-section, not only create/chat/fill |
| Intent then extraction anyway | **PARTIALLY VERIFIED** | True for CHAT/BOTH; WRITE returns first |
| Fill regex because classifier said CHAT | **VERIFIED** in comments | Regex is chat-only; skipped for `@Claude`; button bypasses it |
| Process split forced by Vercel | **VERIFIED** as documented rationale | Internal POST is revert-only, not all REST mutations |
| Railway health before Prisma | **VERIFIED** | |
| Redis best-effort | **PARTIALLY VERIFIED** | Publish only; `psubscribe` never called |
| Shared types vendored | **VERIFIED** | |
| NextAuth Edge split | **VERIFIED** | |
| PDF WinAnsi fold | **VERIFIED** | |
| Strict TS, no `any` | **VERIFIED** (no `: any` / `as any` in ts/tsx) | |
| Mobile-first breakpoints | **PARTIALLY VERIFIED** | CLAUDE.md says `sm:`/`md:`/`lg:`; UI is almost all `sm:`; no `md:`; `lg:` on landing H1 only |
| "Think together. Build together." | marketing copy | Fine as tagline, not a technical claim |
| `FRONTEND_URL` CORS allowlist | **NOT VERIFIED** | Unused; CORS `origin: true` |
| `room-state` used for client hydrate | **NOT VERIFIED** | Emitted, never listened to |

**Do not claim unless you have extra evidence:**
- User counts, latency SLOs, "production scale"
- "Realtime collaboration across multiple server instances"
- "RBAC with viewers"
- "Yjs undo" / `Y.UndoManager`
- Binary Yjs frames (they are JSON `number[]`)
- That `/internal/section-update` fans out every REST mutation
- That `FRONTEND_URL` is the CORS allowlist
- "RAG / embeddings / vector search"
- "Fully tested"
- "OpenAI integration" (`OPENAI_API_KEY` unused)
- Team size > 1
- That fill-from-chat via `@Claude` works the same as the button

---

## 22. My Personal Knowledge Checklist

### Architecture
- [ ] Draw the three boxes (web, server, Postgres) and the internal POST (**revert only**)
- [ ] Explain why Vercel is the wrong place for Yjs
- [ ] Explain vendor/shared without shame (deploy constraint)
- [ ] `room-state` is emitted and unused on the client

### Frontend
- [ ] RSC room page vs client workspace
- [ ] How Tiptap + Yjs is wired (`Collaboration.configure({ document: ydoc })`)
- [ ] Why `setContent` exists
- [ ] Mention autocomplete + pills
- [ ] Split pane + mobile stack

### Backend
- [ ] Listen-then-loadRealtime
- [ ] Every socket event and whether it hits the DB
- [ ] Fire-and-forget AI
- [ ] `ADMIN_SECRET` internal route (revert only)

### Database
- [ ] Sketch User–Room–Member–Section–Snapshot–Message–Suggestion
- [ ] Why both `content` and `yjsState`
- [ ] Cascade delete
- [ ] Missing indexes

### APIs
- [ ] Which routes check owner vs member vs editor vs "any logged-in"
- [ ] Join token flow including 401 redirect

### AI/LLM
- [ ] Four call types and max_tokens
- [ ] Intent vs extract vs fill vs init
- [ ] Why not RAG
- [ ] `@Claude` short-circuit bug/behavior
- [ ] WRITE does not extract

### Real-time/concurrency
- [ ] Per-section Y.Doc
- [ ] Echo prevention
- [ ] 5s debounce + empty-room flush
- [ ] Redis half-implementation (`publish` only)
- [ ] Reconnect / late-join gap (`room-state` ignored)
- [ ] No socket auth

### Security
- [ ] Spoofable socket userId
- [ ] Suggestion IDOR
- [ ] Invite link = EDITOR
- [ ] Prompt injection + cost DoS

### Testing
- [ ] There are no tests — say what you would add first

### Deployment
- [ ] GHA → Railway; Vercel implied
- [ ] `NEXT_PUBLIC_*` rebuild requirement
- [ ] `start.cjs` cwd issue

### Tradeoffs
- [ ] Suggestions vs auto-write
- [ ] Per-section CRDT vs room doc
- [ ] `setContent` vs CRDT AI apply
- [ ] JWT vs DB session
- [ ] Haiku vs larger model

---

## 23. Final "Interview Ready" Test

Answer out loud. No peeking.

1. What problem does codraft solve, in one sentence, without the landing-page slogan?
2. What happens in the first 200ms after a user hits Enter in chat?
3. Where does Claude's section draft live immediately after a fill — chat, CRDT, or Postgres?
4. Why might two users typing in Hotels not conflict, but Claude filling Hotels while someone types still clobber?
5. How is "fill the Budget section" detected, and when is that detector skipped?
6. A teammate accepts a suggestion. How many times is `Section.content` written, and by which processes?
7. You deploy a second Railway replica. What exactly breaks, and what code looks like it should prevent that?
8. Why does middleware not import `auth.ts`?
9. Why are there two Prisma schemas?
10. A user opens an invite-only link they have used before. What happens? What if they have never joined?
11. Last person closes the tab 1 second after typing. Is the paragraph safe? Why?
12. How would you explain your snapshot `reason` field to an interviewer?
13. What is the difference between `filled` and `human_edited`, and who sets each?
14. Why is Socket.io `withCredentials: false`?
15. Walk through PDF export of a room whose Hotels section has curly quotes.
16. What does `/health` prove, and what does it not prove?
17. Name three ways this app can spend Anthropic money faster than you intend.
18. If you had one week before intern interviews, which security fix would you implement and why?
19. Is extraction RAG? If an interviewer says "so you retrieve similar chunks," how do you correct them without being arrogant?
20. What will you say if asked "what's the weakest part of this system?"

### ANSWER KEY (review after)

1. Conversation is the source of truth; the doc lags. Codraft makes the room both surfaces and has Claude propose structured captures. Files: README, `page.tsx`.
2. `send-message` → insert USER row → broadcast `new-message` → load history/sections → `handleMessage` async. Files: `socket-handlers.ts`, `ChatPanel.tsx`.
3. Postgres `Section.content` first (`writeAiContentToSection`); clients then `setContent` into Yjs/Tiptap. Not dumped into chat (EXTRACTION pill). Files: `ai-handler.ts`, `SectionCard.tsx`.
4. Yjs merges concurrent edits; Claude path replaces editor HTML. Files: `useYjsSection.ts`, `SectionCard.tsx`.
5. Regex in `detectFillRequest` inside `detectIntent`; skipped when `parseMentions` finds `@claude` because intent is forced to CHAT. Files: `ai-handler.ts`.
6. Twice: REST `suggestions` POST, then socket `accept-suggestion` Prisma update. Files: `suggestions/route.ts`, `socket-handlers.ts`.
7. In-memory Y.Docs and presence split-brain. `publishSectionUpdate` runs but `subscribeToRoom` is never called. File: `redis-sync.ts`.
8. Edge runtime / no Prisma. Files: `auth.config.ts`, `middleware.ts`.
9. Two processes need a client; server adds `binaryTargets` for Nixpacks. Drift risk. Files: both `schema.prisma`.
10. Existing member: 200 + roomId. New member + invite-only: 403. New + sharing on: create EDITOR. File: `api/join/[token]/route.ts`.
11. `deleteIfEmpty` flushes pending debounce. If the **process** crashes, 5s debounce may lose it. File: `room-state.ts`.
12. `user_edit | claude_fill | extraction_accepted | revert` — source of the snapshot, not a git SHA. Files: schema comments, `SectionHistory.tsx`.
13. `filled` = Claude fill or accepted extraction; `human_edited` = focused typing (`section-human-edit`) or revert (or the unused REST `{ content }` PATCH). Starter seed stays `empty`. Files: `ai-handler.ts`, `section-human-edit`, `api/rooms/route.ts` comments.
14. Avoid CORS+cookie reconnect loops across Vercel vs Railway origins. File: `useSocket.ts`.
15. `toWinAnsi` maps quotes to ASCII; `pdf-lib` StandardFonts. File: `export/route.ts`.
16. Process is listening on PORT. Not: DB up, Socket.io attached, Redis, Anthropic. File: `index.ts`.
17. Parallel init calls per section; every chat → intent+stream+extract; fill button; no rate limit; spoofed socket messages.
18. Socket authz or suggestion IDOR — pick one and be specific. Files: `socket-handlers.ts`, `suggestions/route.ts`.
19. No embeddings/retrieval. Context is current section strings + last 20 messages in the prompt. File: `ai-handler.ts`.
20. Strong answers: unauthenticated sockets; Redis subscribe dead code; unused `room-state`; no tests; `setContent` vs CRDT; VIEWER unused. Pick 1–2, show you would fix them.

---

## Appendix: Files to re-read the night before

1. `apps/server/src/ai-handler.ts` — entire file
2. `apps/server/src/socket-handlers.ts` — entire file
3. `apps/server/src/room-state.ts` — entire file
4. `apps/web/components/room/SectionCard.tsx` — Yjs/Tiptap effects
5. `apps/web/hooks/useYjsSection.ts`
6. `apps/web/auth.ts` + `auth.config.ts` + `middleware.ts`
7. `apps/web/prisma/schema.prisma`
8. `apps/server/src/redis-sync.ts` (know what's missing)
9. `apps/web/app/api/rooms/route.ts` + `suggestions/route.ts` + `join/[token]/route.ts`
10. `packages/shared/src/types.ts`

---

## Appendix: Blanks only you can fill

Copy these into a private notes file:

- Why I built this (personal story, not the README paragraph if they differ)
- What I would demo in 90 seconds
- A bug I actually hit that isn't in comments (502s and fill-classifier are already in comments — have a third)
- Production traffic / whether anyone else used it
- Whether VIEWER and Redis were planned next or abandoned
- Time spent (be honest: scaffold commit vs later polish)

End of guide. Re-read code, not this document, until you can answer §23 without it.
