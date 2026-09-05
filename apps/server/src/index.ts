import dotenv from 'dotenv'
import path from 'path'

dotenv.config()
// Shared local secrets live in apps/web/.env.local (Next.js's env file).
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
import { Server } from 'socket.io'
import { roomManager } from './room-state'
import { registerSocketHandlers } from './socket-handlers'
import { prisma } from './db-client'

const PORT = Number(process.env.PORT) || 3001

// Reflecting the request origin avoids a reconnect loop when the browser
// origin (custom domain, preview URL) isn't an exact FRONTEND_URL match.
// Socket auth is not cookie-based, so credentials are left off.
const corsOptions = {
  origin: true as const,
  credentials: false,
}

const app = express()
app.set('trust proxy', 1)
app.use((req, _res, next) => {
  // Confirms whether Railway's proxy/healthcheck actually reaches Node.
  console.log(`[http] ${req.method} ${req.url}`)
  next()
})
app.use(cors(corsOptions))
app.use(express.json())

function health(_req: express.Request, res: express.Response): void {
  res.json({
    status: 'ok',
    rooms: roomManager.getRoomCount(),
    connections: roomManager.getConnectionCount(),
  })
}

app.get('/', health)
app.get('/health', health)

const server = createServer(app)
const io = new Server(server, {
  cors: corsOptions,
  path: '/socket.io/',
  transports: ['polling', 'websocket'],
  pingInterval: 25000,
  pingTimeout: 60000,
  connectTimeout: 20000,
  allowEIO3: true,
})

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
    const updated = await prisma.section.findUnique({ where: { id: sectionId } })
    if (!updated || updated.roomId !== roomId) {
      res.status(404).json({ error: 'Section not found' })
      return
    }
    io.to(roomId).emit('section-updated', updated)
    res.json({ ok: true })
  } catch (err) {
    console.error('[internal] section-update failed:', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

registerSocketHandlers(io)

// Do not pass a host: `0.0.0.0` is IPv4-only, and Railway's proxy/healthcheck
// may use IPv6. Omitting the host lets Node bind `::` (dual-stack) when available.
// keepAliveTimeout must exceed the proxy idle timeout or reused sockets 502.
server.keepAliveTimeout = 65_000
server.headersTimeout = 66_000
server.listen(PORT, () => {
  console.log(`codraft WebSocket server listening`, server.address())
  console.log('[server] env', {
    DATABASE_URL: process.env.DATABASE_URL ? 'set' : 'MISSING',
    FRONTEND_URL: process.env.FRONTEND_URL || '(unset)',
    ADMIN_SECRET: process.env.ADMIN_SECRET ? 'set' : 'MISSING',
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? 'set' : 'MISSING',
  })
})

server.on('error', (err) => {
  console.error('[server] listen failed:', err)
  process.exit(1)
})
