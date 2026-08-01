import dotenv from 'dotenv'
dotenv.config()

import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { roomManager } from './room-state'
import { registerSocketHandlers } from './socket-handlers'

const PORT = process.env.PORT || 3001

// Localhost for dev + FRONTEND_URL for production (Vercel).
const corsOrigins = [
  'http://localhost:3000',
  process.env.FRONTEND_URL || 'https://codraft.vercel.app',
]

const app = express()
app.use(cors({ origin: corsOrigins, credentials: true }))

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

registerSocketHandlers(io)

// Bind 0.0.0.0 so Railway (and other container hosts) can reach the process.
server.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`codraft WebSocket server listening on 0.0.0.0:${PORT}`)
})
