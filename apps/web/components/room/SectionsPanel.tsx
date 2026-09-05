'use client'

import type { ExtractionSuggestion, SectionData } from '@codraft/shared'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Socket } from 'socket.io-client'
import AddSectionModal from './AddSectionModal'
import SectionCard from './SectionCard'

type OrderUpdate = { id: string; order: number }
type SectionWithYjs = SectionData & { yjsState?: number[] }

function parseOrderUpdates(value: unknown): OrderUpdate[] | null {
  if (typeof value !== 'object' || value === null || !('sections' in value)) return null
  const sections = (value as { sections: unknown }).sections
  if (!Array.isArray(sections)) return null
  const parsed: OrderUpdate[] = []
  for (const item of sections) {
    if (typeof item !== 'object' || item === null) return null
    const row = item as { id?: unknown; order?: unknown }
    if (typeof row.id !== 'string' || typeof row.order !== 'number') return null
    parsed.push({ id: row.id, order: row.order })
  }
  return parsed
}

function applyOrders(prev: SectionData[], updates: OrderUpdate[]): SectionData[] {
  const orderById = new Map(updates.map((s) => [s.id, s.order]))
  return prev.map((s) => {
    const order = orderById.get(s.id)
    return order === undefined ? s : { ...s, order }
  })
}

function swapOrders(
  prev: SectionData[],
  sectionId: string,
  direction: 'up' | 'down'
): SectionData[] | null {
  const sorted = [...prev].sort((a, b) => a.order - b.order)
  const index = sorted.findIndex((s) => s.id === sectionId)
  const swapIndex = direction === 'up' ? index - 1 : index + 1
  if (index < 0 || swapIndex < 0 || swapIndex >= sorted.length) return null
  const current = sorted[index]
  const neighbor = sorted[swapIndex]
  return prev.map((s) => {
    if (s.id === current.id) return { ...s, order: neighbor.order }
    if (s.id === neighbor.id) return { ...s, order: current.order }
    return s
  })
}

interface SectionsPanelProps {
  roomId: string
  initialSections: SectionWithYjs[]
  socket: Socket | null
  currentUserId: string
  currentUserName: string
  currentUserColor: string
  onAskClaude: (sectionName: string) => void
}

function SectionsPanel({
  roomId,
  initialSections,
  socket,
  currentUserId,
  currentUserName,
  currentUserColor,
  onAskClaude,
}: SectionsPanelProps) {
  const [sections, setSections] = useState<SectionData[]>(initialSections)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  // One visible pending suggestion per section; extras wait in queue.
  const [pendingBySection, setPendingBySection] = useState<Record<string, ExtractionSuggestion>>({})
  const suggestionQueueRef = useRef<ExtractionSuggestion[]>([])
  const listRef = useRef<HTMLDivElement>(null)
  const prevTops = useRef<Map<string, number>>(new Map())

  // Hydrate from the server payload once per room. The parent rebuilds
  // `initialSections` on every render, so depending on the array would
  // wipe local reorder/delete state.
  useEffect(() => {
    setSections(initialSections)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

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

    const handleStatusUpdate = (data: { sectionId: string; status: SectionData['status'] }) => {
      setSections((prev) =>
        prev.map((s) => (s.id === data.sectionId ? { ...s, status: data.status } : s))
      )
    }

    const handleDeleted = (data: { sectionId: string }) => {
      setSections((prev) => prev.filter((s) => s.id !== data.sectionId))
      setPendingBySection((prev) => {
        const next = { ...prev }
        delete next[data.sectionId]
        return next
      })
    }

    const handleReordered = (updated: OrderUpdate[]) => {
      setSections((prev) => applyOrders(prev, updated))
    }

    socket.on('section-added', handleSectionAdded)
    socket.on('section-updated', handleSectionUpdated)
    socket.on('section-status-update', handleStatusUpdate)
    socket.on('section-deleted', handleDeleted)
    socket.on('sections-reordered', handleReordered)
    socket.on('extraction-suggestion', handleSuggestion)
    socket.on('suggestion-resolved', handleResolved)

    return () => {
      socket.off('section-added', handleSectionAdded)
      socket.off('section-updated', handleSectionUpdated)
      socket.off('section-status-update', handleStatusUpdate)
      socket.off('section-deleted', handleDeleted)
      socket.off('sections-reordered', handleReordered)
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

  useLayoutEffect(() => {
    const root = listRef.current
    if (!root) return
    const nodes = root.querySelectorAll<HTMLElement>('[data-section-id]')
    const nextTops = new Map<string, number>()
    nodes.forEach((node) => {
      const id = node.dataset.sectionId
      if (!id) return
      const top = node.getBoundingClientRect().top
      nextTops.set(id, top)
      const prev = prevTops.current.get(id)
      if (prev === undefined) return
      const delta = prev - top
      if (Math.abs(delta) < 1) return
      node.style.transition = 'none'
      node.style.transform = `translateY(${delta}px)`
      requestAnimationFrame(() => {
        node.style.transition = 'transform 220ms ease'
        node.style.transform = 'translateY(0)'
        const clear = (event: TransitionEvent) => {
          if (event.propertyName !== 'transform') return
          node.style.transition = ''
          node.style.transform = ''
          node.removeEventListener('transitionend', clear)
        }
        node.addEventListener('transitionend', clear)
      })
    })
    prevTops.current = nextTops
  }, [sortedSections])

  async function moveSection(sectionId: string, direction: 'up' | 'down') {
    const snapshot = sections
    const next = swapOrders(snapshot, sectionId, direction)
    if (!next) return
    setSections(next)

    try {
      const res = await fetch(`/api/rooms/${roomId}/sections/${sectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction }),
      })
      if (!res.ok) {
        setSections(snapshot)
        return
      }
      const sectionsPayload = parseOrderUpdates(await res.json())
      if (sectionsPayload) {
        setSections((prev) => applyOrders(prev, sectionsPayload))
        socket?.emit('reorder-sections', roomId, sectionsPayload)
      }
    } catch {
      setSections(snapshot)
    }
  }

  async function deleteSection(sectionId: string) {
    if (!window.confirm('Delete this section?')) return
    const snapshot = sections
    setSections((prev) => prev.filter((s) => s.id !== sectionId))
    const res = await fetch(`/api/rooms/${roomId}/sections/${sectionId}`, { method: 'DELETE' })
    if (!res.ok) {
      setSections(snapshot)
      return
    }
    socket?.emit('delete-section', roomId, sectionId)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border pl-3 pr-5">
        <span className="text-sm font-medium text-fg">Sections</span>
        <button type="button" onClick={() => setIsAddModalOpen(true)} className="btn-ghost px-2 py-1 text-xs">
          + Add Section
        </button>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {sortedSections.map((section, index) => (
          <SectionCard
            key={section.id}
            section={section}
            roomId={roomId}
            socket={socket}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            currentUserColor={currentUserColor}
            onAskClaude={onAskClaude}
            initialYjsState={yjsStateById.get(section.id)}
            pendingSuggestion={pendingBySection[section.id] ?? null}
            canMoveUp={index > 0}
            canMoveDown={index < sortedSections.length - 1}
            onMove={(direction) => moveSection(section.id, direction)}
            onDelete={() => deleteSection(section.id)}
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
