'use client'

import type { ExtractionSuggestion, SectionData } from '@codraft/shared'
import { useEffect, useMemo, useRef, useState } from 'react'
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
  // One visible pending suggestion per section; extras wait in queue.
  const [pendingBySection, setPendingBySection] = useState<Record<string, ExtractionSuggestion>>({})
  const suggestionQueueRef = useRef<ExtractionSuggestion[]>([])

  useEffect(() => {
    setSections(initialSections)
  }, [initialSections])

  // Scroll to a section card when chat mention pills fire the custom event.
  useEffect(() => {
    function onScrollToSection(e: Event) {
      const detail = (e as CustomEvent<{ sectionName: string }>).detail
      if (!detail?.sectionName) return
      const el = document.querySelector(
        `[data-section-name="${CSS.escape(detail.sectionName)}"]`
      )
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    window.addEventListener('codraft:scroll-to-section', onScrollToSection)
    return () => window.removeEventListener('codraft:scroll-to-section', onScrollToSection)
  }, [])

  useEffect(() => {
    if (!socket) return

    const handleSectionAdded = (section: SectionData) => {
      setSections((prev) => (prev.some((s) => s.id === section.id) ? prev : [...prev, section]))
    }

    const handleSectionUpdated = (section: SectionData) => {
      setSections((prev) => prev.map((s) => (s.id === section.id ? section : s)))
    }

    const promoteNext = (occupied: Record<string, ExtractionSuggestion>) => {
      const nextOccupied = { ...occupied }
      const remaining: ExtractionSuggestion[] = []
      for (const item of suggestionQueueRef.current) {
        if (!nextOccupied[item.sectionId]) {
          nextOccupied[item.sectionId] = item
        } else {
          remaining.push(item)
        }
      }
      suggestionQueueRef.current = remaining
      return nextOccupied
    }

    const handleSuggestion = (data: ExtractionSuggestion) => {
      setPendingBySection((prev) => {
        if (prev[data.sectionId]) {
          suggestionQueueRef.current = [...suggestionQueueRef.current, data]
          return prev
        }
        return { ...prev, [data.sectionId]: data }
      })
    }

    const handleResolved = (data: { suggestionId: string }) => {
      setPendingBySection((prev) => {
        const next = { ...prev }
        for (const [sectionId, suggestion] of Object.entries(next)) {
          if (suggestion.id === data.suggestionId) {
            delete next[sectionId]
            break
          }
        }
        // Drop the resolved id from the waiting queue too (reject/accept races).
        suggestionQueueRef.current = suggestionQueueRef.current.filter(
          (s) => s.id !== data.suggestionId
        )
        return promoteNext(next)
      })
    }

    socket.on('section-added', handleSectionAdded)
    socket.on('section-updated', handleSectionUpdated)
    socket.on('extraction-suggestion', handleSuggestion)
    socket.on('suggestion-resolved', handleResolved)

    return () => {
      socket.off('section-added', handleSectionAdded)
      socket.off('section-updated', handleSectionUpdated)
      socket.off('extraction-suggestion', handleSuggestion)
      socket.off('suggestion-resolved', handleResolved)
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
            pendingSuggestion={pendingBySection[section.id] ?? null}
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
