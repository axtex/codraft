import * as Y from 'yjs'
import type { RoomMemberInfo } from '@codraft/shared'
import { saveSectionState } from './db-client'

export const CURSOR_COLORS = [
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#96CEB4',
  '#FFEAA7',
  '#DDA0DD',
  '#FF8B94',
  '#A8E6CF',
]

interface ConnectedClient {
  socketId: string
  userId: string
  userName: string
  userImage?: string
  color: string
}

interface RoomState {
  sections: Map<string, Y.Doc>
  clients: Map<string, ConnectedClient>
  saveTimeouts: Map<string, NodeJS.Timeout>
}

// Debounce window for persisting a section's Yjs state to Postgres. Editors
// can fire many small updates per second; writing on every update would
// hammer the DB, so we coalesce bursts and only persist once activity settles.
const SAVE_DEBOUNCE_MS = 5000

// TipTap Collaboration stores the doc in XmlFragment('default'), not Y.Text.
// Walk that fragment so debounced saves don't wipe `content` with an empty string.
function yXmlPlainText(node: Y.XmlFragment | Y.XmlElement): string {
  const parts: string[] = []
  node.forEach((child) => {
    if (child instanceof Y.XmlText) {
      parts.push(child.toString())
    } else if (child instanceof Y.XmlElement) {
      const inner = yXmlPlainText(child)
      parts.push(inner)
      if (child.nodeName === 'paragraph' || child.nodeName === 'heading' || child.nodeName === 'listItem') {
        parts.push('\n')
      }
    }
  })
  return parts.join('').trimEnd()
}

function getSectionPlainText(ydoc: Y.Doc): string {
  return yXmlPlainText(ydoc.getXmlFragment('default'))
}

class RoomManager {
  private rooms = new Map<string, RoomState>()

  getOrCreate(roomId: string): RoomState {
    let room = this.rooms.get(roomId)
    if (!room) {
      room = {
        sections: new Map(),
        clients: new Map(),
        saveTimeouts: new Map(),
      }
      this.rooms.set(roomId, room)
    }
    return room
  }

  addClient(
    roomId: string,
    socketId: string,
    userId: string,
    userName: string,
    userImage?: string
  ): ConnectedClient {
    const room = this.getOrCreate(roomId)
    const usedColors = new Set(Array.from(room.clients.values()).map((c) => c.color))
    const color =
      CURSOR_COLORS.find((c) => !usedColors.has(c)) ??
      CURSOR_COLORS[room.clients.size % CURSOR_COLORS.length]

    const client: ConnectedClient = { socketId, userId, userName, userImage, color }
    room.clients.set(socketId, client)
    return client
  }

  removeClient(roomId: string, socketId: string): void {
    const room = this.rooms.get(roomId)
    if (!room) return
    room.clients.delete(socketId)
  }

  getPresence(roomId: string): RoomMemberInfo[] {
    const room = this.rooms.get(roomId)
    if (!room) return []
    return Array.from(room.clients.values()).map((c) => ({
      userId: c.userId,
      name: c.userName,
      image: c.userImage,
      // RoomManager only tracks live connections, not DB-persisted roles —
      // callers that need real roles should merge this with a DB lookup.
      role: 'EDITOR',
      isOnline: true,
      cursorColor: c.color,
    }))
  }

  getSectionDoc(roomId: string, sectionId: string): Y.Doc {
    const room = this.getOrCreate(roomId)
    let doc = room.sections.get(sectionId)
    if (!doc) {
      doc = new Y.Doc()
      room.sections.set(sectionId, doc)
    }
    return doc
  }

  scheduleSectionSave(roomId: string, sectionId: string, ydoc: Y.Doc): void {
    const room = this.getOrCreate(roomId)
    const existing = room.saveTimeouts.get(sectionId)
    if (existing) clearTimeout(existing)

    const timeout = setTimeout(() => {
      room.saveTimeouts.delete(sectionId)
      const content = getSectionPlainText(ydoc)
      saveSectionState(sectionId, ydoc, content).catch((err) => {
        console.error(`[room-state] failed to save section ${sectionId}:`, err)
      })
    }, SAVE_DEBOUNCE_MS)

    room.saveTimeouts.set(sectionId, timeout)
  }

  deleteIfEmpty(roomId: string): void {
    const room = this.rooms.get(roomId)
    if (!room || room.clients.size > 0) return

    // Cancel pending debounced timers, but actually persist their state first —
    // otherwise the last few seconds of edits before the last client leaves
    // would be silently dropped instead of saved.
    for (const [sectionId, timeout] of room.saveTimeouts.entries()) {
      clearTimeout(timeout)
      const ydoc = room.sections.get(sectionId)
      if (ydoc) {
        const content = getSectionPlainText(ydoc)
        saveSectionState(sectionId, ydoc, content).catch((err) => {
          console.error(`[room-state] failed to flush section ${sectionId} on room cleanup:`, err)
        })
      }
    }
    room.saveTimeouts.clear()

    this.rooms.delete(roomId)
  }

  getRoomCount(): number {
    return this.rooms.size
  }

  getConnectionCount(): number {
    let total = 0
    for (const room of this.rooms.values()) {
      total += room.clients.size
    }
    return total
  }
}

export const roomManager = new RoomManager()
