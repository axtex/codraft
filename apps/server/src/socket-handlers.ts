import type { Server, Socket } from 'socket.io'
import * as Y from 'yjs'
import type { CursorInfo, SectionData } from '@codraft/shared'
import { prisma, getChatHistory } from './db-client'
import { roomManager } from './room-state'
import { publishSectionUpdate } from './redis-sync'
import { handleMessage } from './ai-handler'

// This module registers its own `io.on('connection', ...)` listener rather
// than exposing per-event handlers — index.ts just calls
// registerSocketHandlers(io) once at startup.

function mapSection(row: {
  id: string
  roomId: string
  name: string
  order: number
  status: string
  content: string | null
  addedBy: string
  updatedAt: Date
  updatedBy: string | null
}): SectionData {
  return {
    id: row.id,
    roomId: row.roomId,
    name: row.name,
    order: row.order,
    status: row.status as SectionData['status'],
    content: row.content ?? '',
    addedBy: row.addedBy,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  }
}

export function registerSocketHandlers(io: Server): void {
  io.on('connection', (socket: Socket) => {
    // Track which rooms this socket has joined so disconnect can clean up
    // every one of them, not just the last.
    const joinedRooms = new Set<string>()

    socket.on(
      'join-room',
      async (
        roomId: string,
        userId: string,
        userName: string,
        userImage?: string
      ) => {
        try {
          roomManager.addClient(roomId, socket.id, userId, userName, userImage)
          socket.join(roomId)
          joinedRooms.add(roomId)

          const sectionRows = await prisma.section.findMany({
            where: { roomId },
            orderBy: { order: 'asc' },
          })
          const sections = sectionRows.map(mapSection)

          // Hydrate each section's in-memory Y.Doc from persisted state (if any)
          // so newly-joining clients and future edits build on prior content.
          for (const row of sectionRows) {
            if (row.yjsState) {
              const ydoc = roomManager.getSectionDoc(roomId, row.id)
              Y.applyUpdate(ydoc, new Uint8Array(row.yjsState))
            }
          }

          const chatHistory = await getChatHistory(roomId, 50)

          socket.emit('room-state', {
            members: roomManager.getPresence(roomId),
            chatHistory,
            sections: sections.map((s) => ({
              ...s,
              yjsState: Array.from(Y.encodeStateAsUpdate(roomManager.getSectionDoc(roomId, s.id))),
            })),
          })

          socket.to(roomId).emit('user-joined', { userId, userName, userImage, socketId: socket.id })
          io.to(roomId).emit('presence-update', roomManager.getPresence(roomId))
        } catch (err) {
          console.error('[socket-handlers] join-room failed:', err)
        }
      }
    )

    socket.on(
      'send-message',
      async (roomId: string, message: string, userId: string, userName: string) => {
        try {
          const savedMessage = await prisma.chatMessage
            .create({
              data: { roomId, userId, userName, content: message, type: 'USER' },
            })
            .then((row) => ({
              id: row.id,
              roomId: row.roomId,
              userId: row.userId,
              userName: row.userName,
              userImage: row.userImage ?? undefined,
              content: row.content,
              type: row.type as 'USER',
              createdAt: row.createdAt,
            }))

          io.to(roomId).emit('new-message', savedMessage)

          // Fresh context for the AI call — simplest correct approach even
          // though we just wrote one of these messages ourselves.
          const [chatHistory, sectionRows] = await Promise.all([
            getChatHistory(roomId, 20),
            prisma.section.findMany({ where: { roomId }, orderBy: { order: 'asc' } }),
          ])
          const sections = sectionRows.map(mapSection)

          // Fire-and-forget: AI work must never block or crash this handler.
          handleMessage(io, socket, roomId, message, userId, userName, chatHistory, sections).catch(
            (err) => console.error('[socket-handlers] handleMessage rejected:', err)
          )
        } catch (err) {
          console.error('[socket-handlers] send-message failed:', err)
        }
      }
    )

    socket.on('yjs-update', (roomId: string, sectionId: string, update: number[]) => {
      try {
        const updateBytes = new Uint8Array(update)
        const ydoc = roomManager.getSectionDoc(roomId, sectionId)
        Y.applyUpdate(ydoc, updateBytes)

        // Exclude the sender — it already applied this update locally
        // before emitting, so echoing it back would be redundant.
        socket.to(roomId).emit('yjs-update', { sectionId, update })

        publishSectionUpdate(roomId, sectionId, updateBytes).catch((err) =>
          console.error('[socket-handlers] publishSectionUpdate failed:', err)
        )

        roomManager.scheduleSectionSave(roomId, sectionId, ydoc)
      } catch (err) {
        console.error('[socket-handlers] yjs-update failed:', err)
      }
    })

    socket.on('cursor-update', (roomId: string, sectionId: string, cursor: CursorInfo) => {
      socket.to(roomId).emit('cursor-update', cursor)
    })

    socket.on('add-section', (roomId: string, section: SectionData) => {
      // Broadcast to everyone including the sender so every open tab adds
      // the card consistently (rather than the sender adding it optimistically).
      io.to(roomId).emit('section-added', section)
    })

    socket.on(
      'accept-suggestion',
      async (roomId: string, suggestionId: string, sectionId: string, content: string) => {
        try {
          const updated = await prisma.section.update({
            where: { id: sectionId },
            data: { content, status: 'filled' },
          })

          const ydoc = roomManager.getSectionDoc(roomId, sectionId)
          const ytext = ydoc.getText('content')
          ydoc.transact(() => {
            ytext.delete(0, ytext.length)
            ytext.insert(0, content)
          })

          io.to(roomId).emit('section-updated', updated)
          io.to(roomId).emit('suggestion-resolved', { suggestionId })
        } catch (err) {
          console.error('[socket-handlers] accept-suggestion failed:', err)
        }
      }
    )

    socket.on('reject-suggestion', (roomId: string, suggestionId: string) => {
      io.to(roomId).emit('suggestion-resolved', { suggestionId })
    })

    socket.on('disconnect', () => {
      for (const roomId of joinedRooms) {
        const client = roomManager.getOrCreate(roomId).clients.get(socket.id)
        const userId = client?.userId
        roomManager.removeClient(roomId, socket.id)
        socket.to(roomId).emit('user-left', { userId, socketId: socket.id })
        io.to(roomId).emit('presence-update', roomManager.getPresence(roomId))
        roomManager.deleteIfEmpty(roomId)
      }
      joinedRooms.clear()
    })
  })
}
