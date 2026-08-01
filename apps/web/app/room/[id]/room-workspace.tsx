'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSocket } from '@/hooks/useSocket'
import { ChatPanel } from '@/components/room/ChatPanel'
import { ExportButton } from '@/components/room/ExportButton'
import { SectionsPanel } from '@/components/room/SectionsPanel'
import { ShareModal } from '@/components/room/ShareModal'
import type { ChatMessage, RoomMemberInfo, SectionData, SectionStatus } from '@codraft/shared'

interface RoomWorkspaceProps {
  room: {
    id: string
    name: string
    fullSlug: string
    linkSharingEnabled: boolean
    ownerId: string
    inviteToken: string
  }
  members: RoomMemberInfo[]
  sections: (Omit<SectionData, 'status' | 'updatedAt'> & {
    status: string
    updatedAt: string
    yjsState?: number[]
  })[]
  messages: (Omit<ChatMessage, 'createdAt'> & { createdAt: string })[]
  currentUser: { id: string; name: string; image?: string }
}

export function RoomWorkspace({ room, members, sections, messages, currentUser }: RoomWorkspaceProps) {
  const { socket, isConnected } = useSocket(room.id, currentUser.id, currentUser.name, currentUser.image)
  const [roomName, setRoomName] = useState(room.name)
  const [isEditingName, setIsEditingName] = useState(false)
  const [isShareOpen, setIsShareOpen] = useState(false)
  const [linkSharingEnabled, setLinkSharingEnabled] = useState(room.linkSharingEnabled)
  const [presence, setPresence] = useState<RoomMemberInfo[]>(members)
  const [panelSplit, setPanelSplit] = useState(35) // left panel width, %
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null)
  const isDraggingRef = useRef(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const typedSections: (SectionData & { yjsState?: number[] })[] = sections.map((s) => ({
    ...s,
    status: s.status as SectionStatus,
    updatedAt: new Date(s.updatedAt),
  }))
  const typedMessages: ChatMessage[] = messages.map((m) => ({
    ...m,
    createdAt: new Date(m.createdAt),
  }))

  useEffect(() => {
    if (!socket) return
    function onPresence(next: RoomMemberInfo[]) {
      setPresence(next)
    }
    socket.on('presence-update', onPresence)
    return () => {
      socket.off('presence-update', onPresence)
    }
  }, [socket])

  const isOwner = room.ownerId === currentUser.id
  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/join/${room.inviteToken}`
  const onlineCount = presence.filter((p) => p.isOnline).length || 1

  async function saveRoomName() {
    setIsEditingName(false)
    if (roomName.trim() === room.name || !roomName.trim()) {
      setRoomName(room.name)
      return
    }
    await fetch(`/api/rooms/${room.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: roomName.trim() }),
    })
  }

  async function toggleLinkSharing(next: boolean) {
    setLinkSharingEnabled(next)
    await fetch(`/api/rooms/${room.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkSharingEnabled: next }),
    })
  }

  function askClaudeToFill(sectionName: string) {
    // Dedicated fill event — keeps the chat clear of the prompt + draft dump.
    if (socket) {
      socket.emit('fill-section', room.id, sectionName, currentUser.id, currentUser.name)
    }
  }

  function startDrag() {
    isDraggingRef.current = true
    function onMove(e: MouseEvent) {
      if (!isDraggingRef.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const pct = ((e.clientX - rect.left) / rect.width) * 100
      setPanelSplit(Math.min(60, Math.max(20, pct)))
    }
    function onUp() {
      isDraggingRef.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Link href="/dashboard" className="font-bold text-fg">
            codraft
          </Link>
          <span className="text-fg-subtle">/</span>
          {isEditingName ? (
            <input
              autoFocus
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              onBlur={saveRoomName}
              onKeyDown={(e) => e.key === 'Enter' && saveRoomName()}
              className="min-w-0 rounded border border-accent px-1 text-sm outline-none"
            />
          ) : (
            <button
              className="min-w-0 truncate font-medium text-fg hover:underline"
              onClick={() => isOwner && setIsEditingName(true)}
              title={isOwner ? 'Click to rename' : undefined}
            >
              {roomName}
            </button>
          )}
        </div>

        <div className="hidden items-center gap-1 sm:flex">
          {presence.slice(0, 5).map((p) => (
            <div
              key={p.userId}
              title={p.name}
              className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-bg text-[10px] font-medium text-white"
              style={{ backgroundColor: p.cursorColor }}
            >
              {p.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image} alt={p.name} className="h-full w-full rounded-full" />
              ) : (
                p.name[0]?.toUpperCase()
              )}
            </div>
          ))}
          <span className="ml-2 flex items-center gap-1 text-xs text-fg-muted">
            <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-success' : 'bg-fg-subtle'}`} />
            {onlineCount} online
          </span>
        </div>

        <div className="flex items-center gap-2">
          <ExportButton roomId={room.id} roomName={roomName} />
          <button className="btn-primary" onClick={() => setIsShareOpen(true)}>
            Share
          </button>
        </div>
      </header>

      {/* Main area */}
      <div ref={containerRef} className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <div
          className="min-h-0 border-b border-border sm:border-b-0 sm:border-r"
          style={{ flexBasis: `${panelSplit}%` }}
        >
          <ChatPanel
            roomId={room.id}
            sections={typedSections}
            socket={socket}
            isConnected={isConnected}
            currentUserId={currentUser.id}
            currentUserName={currentUser.name}
            initialMessages={typedMessages}
            presence={presence}
            inputRef={chatInputRef}
          />
        </div>

        {/* Resize handle — desktop only */}
        <div
          onMouseDown={startDrag}
          className="hidden w-1 shrink-0 cursor-col-resize bg-border transition hover:bg-accent sm:block"
        />

        <div className="min-h-0 flex-1">
          <SectionsPanel
            roomId={room.id}
            initialSections={typedSections}
            socket={socket}
            currentUserId={currentUser.id}
            onAskClaude={askClaudeToFill}
          />
        </div>
      </div>

      <ShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        inviteUrl={inviteUrl}
        linkSharingEnabled={linkSharingEnabled}
        isOwner={isOwner}
        members={presence.map((p) => ({ userId: p.userId, name: p.name, image: p.image, role: p.role }))}
        onToggleLinkSharing={toggleLinkSharing}
      />
    </div>
  )
}
