export type RoomTemplate =
  | 'trip'
  | 'meeting'
  | 'project'
  | 'research'
  | 'brainstorm'
  | 'custom'

export type SectionStatus = 'empty' | 'in_progress' | 'filled' | 'human_edited'

export type MessageType = 'USER' | 'AI' | 'SYSTEM' | 'EXTRACTION'

export interface RoomMemberInfo {
  userId: string
  name: string
  image?: string
  role: 'OWNER' | 'EDITOR' | 'VIEWER'
  isOnline: boolean
  cursorColor: string
}

export interface ChatMessage {
  id: string
  roomId: string
  userId: string | null
  userName: string
  userImage?: string
  content: string
  type: MessageType
  createdAt: Date
}

export interface SectionData {
  id: string
  roomId: string
  name: string
  order: number
  status: SectionStatus
  content: string
  addedBy: 'system' | string
  updatedAt: Date
  updatedBy: string | null
}

export interface ExtractionSuggestion {
  id: string
  roomId: string
  sectionId: string
  sectionName: string
  content: string
  reasoning: string
}

export interface CursorInfo {
  userId: string
  userName: string
  color: string
  sectionId: string
  position: number
}
