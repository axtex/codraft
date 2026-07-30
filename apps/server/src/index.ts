import dotenv from 'dotenv'
dotenv.config()

import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { roomManager } from './room-state'
import { registerSocketHandlers } from './socket-handlers'

const PORT = process.env.PORT || 3001

const app = express()
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }))

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    rooms: roomManager.getRoomCount(),
    connections: roomManager.getConnectionCount(),
  })
})

const server = createServer(app)
const io = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL, credentials: true },
})

registerSocketHandlers(io)

server.listen(PORT, () => {
  console.log(`codraft WebSocket server listening on port ${PORT}`)
})
