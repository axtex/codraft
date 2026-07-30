'use client'

import type { SectionData } from '@codraft/shared'
import { useEffect, useMemo, useState } from 'react'
import type { Socket } from 'socket.io-client'
import AddSectionModal from './AddSectionModal'
import SectionCard from './SectionCard'

type SectionWithYjs = SectionData & { yjsState?: number[] }

interface SectionsPanelProps {
  roomId: string
  initialSections: SectionWithYjs[]
  socket: Socket | null
  currentUserId: string
  onAskClaude: (sectionName: string) => void
}

function SectionsPanel({
  roomId,
  initialSections,
  socket,
  currentUserId,
  onAskClaude,
}: SectionsPanelProps) {
  const [sections, setSections] = useState<SectionData[]>(initialSections)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)

  useEffect(() => {
    setSections(initialSections)
  }, [initialSections])

  useEffect(() => {
    if (!socket) return

    const handleSectionAdded = (section: SectionData) => {
      setSections((prev) => (prev.some((s) => s.id === section.id) ? prev : [...prev, section]))
    }

    const handleSectionUpdated = (section: SectionData) => {
      setSections((prev) => prev.map((s) => (s.id === section.id ? section : s)))
    }

    socket.on('section-added', handleSectionAdded)
    socket.on('section-updated', handleSectionUpdated)

    return () => {
      socket.off('section-added', handleSectionAdded)
      socket.off('section-updated', handleSectionUpdated)
    }
  }, [socket])

  const yjsStateById = useMemo(() => {
    const map = new Map<string, number[] | undefined>()
    initialSections.forEach((s) => map.set(s.id, s.yjsState))
    return map
  }, [initialSections])

  const sortedSections = useMemo(() => [...sections].sort((a, b) => a.order - b.order), [sections])

  return (
    <div className="flex flex-col h-full">
      <div className="h-10 border-b border-border flex items-center justify-between px-4 shrink-0">
        <span className="text-sm font-medium text-fg">Sections</span>
        <button type="button" onClick={() => setIsAddModalOpen(true)} className="btn-ghost text-xs">
          + Add Section
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {sortedSections.map((section) => (
          <SectionCard
            key={section.id}
            section={section}
            roomId={roomId}
            socket={socket}
            currentUserId={currentUserId}
            onAskClaude={onAskClaude}
            initialYjsState={yjsStateById.get(section.id)}
          />
        ))}
      </div>

      <AddSectionModal
        roomId={roomId}
        socket={socket}
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onCreated={(section) => {
          setSections((prev) => (prev.some((s) => s.id === section.id) ? prev : [...prev, section]))
        }}
      />
    </div>
  )
}

export default SectionsPanel
// Named export too: room-workspace.tsx (owned by another agent) imports { SectionsPanel }.
export { SectionsPanel }
