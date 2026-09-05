import dotenv from 'dotenv'
import path from 'path'

dotenv.config()
dotenv.config({ path: path.resolve(process.cwd(), '../web/.env.local') })

process.on('uncaughtException', (err) => {
  console.error('[fatal uncaughtException]', err)
})
process.on('unhandledRejection', (err) => {
  console.error('[fatal unhandledRejection]', err)
})

import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import type { Server as SocketIOServer } from 'socket.io'

const PORT = Number(process.env.PORT) || 3001

const corsOptions = {
  origin: true as const,
  credentials: false,
}

const app = express()
app.set('trust proxy', 1)
app.use((req, _res, next) => {
  console.log(`[http] ${req.method} ${req.url}`)
  next()
})
app.use(cors(corsOptions))
app.use(express.json())

// Health does not import Prisma / Socket.io — Railway must get a 200 as soon
// as PORT is bound, or the edge keeps serving fallback 502s.
app.get('/', (_req, res) => {
  res.json({ status: 'ok' })
})
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

const server = createServer(app)
server.keepAliveTimeout = 65_000
server.headersTimeout = 66_000

let io: SocketIOServer | null = null

app.post('/internal/section-update', async (req, res) => {
  const secret = req.headers['x-internal-secret']
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const body = req.body as { roomId?: unknown; sectionId?: unknown; content?: unknown }
  const roomId = typeof body.roomId === 'string' ? body.roomId : ''
  const sectionId = typeof body.sectionId === 'string' ? body.sectionId : ''
  if (!roomId || !sectionId || typeof body.content !== 'string') {
    res.status(400).json({ error: 'roomId, sectionId, and content are required' })
    return
  }

  try {
    const { prisma } = await import('./db-client')
    const updated = await prisma.section.findUnique({ where: { id: sectionId } })
    if (!updated || updated.roomId !== roomId) {
      res.status(404).json({ error: 'Section not found' })
      return
    }
    io?.to(roomId).emit('section-updated', updated)
    res.json({ ok: true })
  } catch (err) {
    console.error('[internal] section-update failed:', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

async function loadRealtime(): Promise<void> {
  try {
    const { Server } = await import('socket.io')
    const { registerSocketHandlers } = await import('./socket-handlers')
    io = new Server(server, {
      cors: corsOptions,
      path: '/socket.io/',
      transports: ['polling', 'websocket'],
      pingInterval: 25000,
      pingTimeout: 60000,
      connectTimeout: 20000,
      allowEIO3: true,
    })
    registerSocketHandlers(io)
    console.log('[server] socket.io attached')
  } catch (err) {
    console.error('[server] socket.io failed to attach (HTTP health still up):', err)
  }
}

// Railway requires 0.0.0.0 + $PORT. Do not import Prisma first — that delayed
// listen and left the replica out of the edge rotation (fallback 502).
server.listen(PORT, '0.0.0.0', () => {
  console.log(`codraft WebSocket server listening on 0.0.0.0:${PORT}`)
  void loadRealtime()
})

server.on('error', (err) => {
  console.error('[server] listen failed:', err)
  process.exit(1)
})
