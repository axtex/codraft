import { PrismaClient } from '@prisma/client'
import * as Y from 'yjs'
import type { ChatMessage, ExtractionSuggestion, MessageType } from '@codraft/shared'

// Separate PrismaClient instance from apps/web — this is a distinct Node
// process (the WS server) talking to the same Railway Postgres DB.
export const prisma = new PrismaClient()

export async function saveSectionState(
  sectionId: string,
  ydoc: Y.Doc,
  content: string
): Promise<void> {
  const state = Buffer.from(Y.encodeStateAsUpdate(ydoc))
  await prisma.section.update({
    where: { id: sectionId },
    data: { yjsState: state, content },
  })
}

export async function loadSectionState(sectionId: string): Promise<Uint8Array | null> {
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    select: { yjsState: true },
  })
  if (!section?.yjsState) return null
  return new Uint8Array(section.yjsState)
}

export async function getChatHistory(roomId: string, limit: number): Promise<ChatMessage[]> {
  // Query newest-first with `take`, then reverse in memory to return
  // chronological (oldest-first) order for the caller.
  const rows = await prisma.chatMessage.findMany({
    where: { roomId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  return rows.reverse().map(mapChatMessage)
}

export async function saveMessage(data: {
  roomId: string
  userId: string | null
  userName: string
  userImage?: string
  content: string
  type: MessageType
}): Promise<ChatMessage> {
  const row = await prisma.chatMessage.create({
    data: {
      roomId: data.roomId,
      userId: data.userId,
      userName: data.userName,
      userImage: data.userImage,
      content: data.content,
      type: data.type,
    },
  })
  return mapChatMessage(row)
}

export async function createSuggestion(data: {
  roomId: string
  sectionId: string
  content: string
  reasoning?: string
}): Promise<ExtractionSuggestion> {
  const section = await prisma.section.findUnique({
    where: { id: data.sectionId },
    select: { name: true },
  })

  const row = await prisma.extractionSuggestion.create({
    data: {
      roomId: data.roomId,
      sectionId: data.sectionId,
      content: data.content,
      reasoning: data.reasoning,
    },
  })

  return {
    id: row.id,
    roomId: row.roomId,
    sectionId: row.sectionId,
    sectionName: section?.name ?? '',
    content: row.content,
    reasoning: row.reasoning ?? '',
  }
}

function mapChatMessage(row: {
  id: string
  roomId: string
  userId: string | null
  userName: string
  userImage: string | null
  content: string
  type: string
  createdAt: Date
}): ChatMessage {
  return {
    id: row.id,
    roomId: row.roomId,
    userId: row.userId,
    userName: row.userName,
    userImage: row.userImage ?? undefined,
    content: row.content,
    type: row.type as MessageType,
    createdAt: row.createdAt,
  }
}
