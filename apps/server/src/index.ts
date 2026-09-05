import dotenv from 'dotenv'
import path from 'path'

dotenv.config()
// Shared local secrets live in apps/web/.env.local (Next.js's env file).
dotenv.config({ path: path.resolve(process.cwd(), '../web/.env.local') })

import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { roomManager } from './room-state'
import { registerSocketHandlers } from './socket-handlers'
import { prisma } from './db-client'

const PORT = process.env.PORT || 3001

// Localhost for dev + FRONTEND_URL for production (Vercel).
const corsOrigins = [
  'http://localhost:3000',
  process.env.FRONTEND_URL || 'https://codraft-slate.vercel.app',
]

const app = express()
app.use(cors({ origin: corsOrigins, credentials: true }))
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    rooms: roomManager.getRoomCount(),
    connections: roomManager.getConnectionCount(),
  })
})

const server = createServer(app)
const io = new Server(server, {
  cors: { origin: corsOrigins, credentials: true },
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

// Bind 0.0.0.0 so Railway (and other container hosts) can reach the process.
server.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`codraft WebSocket server listening on 0.0.0.0:${PORT}`)
})
