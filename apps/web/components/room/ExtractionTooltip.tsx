'use client'

import type { ExtractionSuggestion, SectionData } from '@codraft/shared'
import { useEffect, useRef, useState } from 'react'
import type { Socket } from 'socket.io-client'

interface ExtractionTooltipProps {
  roomId: string
  socket: Socket | null
  sections?: SectionData[]
}

const COUNTDOWN_SECONDS = 8
const RING_RADIUS = 14
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

function ExtractionTooltip({ roomId, socket }: ExtractionTooltipProps) {
  const [queue, setQueue] = useState<ExtractionSuggestion[]>([])
  const [suggestion, setSuggestion] = useState<ExtractionSuggestion | null>(null)
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS)
  const [isVisible, setIsVisible] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Pull the next suggestion off the queue whenever nothing is displayed.
  useEffect(() => {
    if (suggestion === null && queue.length > 0) {
      const [next, ...rest] = queue
      setSuggestion(next)
      setQueue(rest)
    }
  }, [suggestion, queue])

  useEffect(() => {
    if (!socket) return
    const handleSuggestion = (data: ExtractionSuggestion) => {
      setQueue((prev) => [...prev, data])
    }
    const handleResolved = (data: { suggestionId: string }) => {
      setSuggestion((current) => {
        if (current?.id === data.suggestionId) return null
        return current
      })
    }
    socket.on('extraction-suggestion', handleSuggestion)
    socket.on('suggestion-resolved', handleResolved)
    return () => {
      socket.off('extraction-suggestion', handleSuggestion)
      socket.off('suggestion-resolved', handleResolved)
    }
  }, [socket])

  useEffect(() => {
    if (!suggestion) {
      setIsVisible(false)
      return
    }
    setCountdown(COUNTDOWN_SECONDS)
    const timeout = setTimeout(() => setIsVisible(true), 20)

    intervalRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current)
          return 0
        }
        return c - 1
      })
    }, 1000)

    return () => {
      clearTimeout(timeout)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [suggestion])

  useEffect(() => {
    if (suggestion && countdown === 0) {
      void handleAccept()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown, suggestion])

  const advance = () => setSuggestion(null)

  const handleAccept = async () => {
    if (!suggestion) return
    const current = suggestion
    advance()
    try {
      await fetch(`/api/rooms/${roomId}/suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionId: current.id }),
      })
      socket?.emit('accept-suggestion', roomId, current.id, current.sectionId, current.content)
    } catch {
      // best-effort — the suggestion is already dismissed client-side
    }
  }

  const handleReject = async () => {
    if (!suggestion) return
    const current = suggestion
    advance()
    try {
      await fetch(`/api/rooms/${roomId}/suggestions`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionId: current.id }),
      })
      socket?.emit('reject-suggestion', roomId, current.id)
    } catch {
      // best-effort — the suggestion is already dismissed client-side
    }
  }

  if (!suggestion) return null

  const preview =
    suggestion.content.length > 60 ? `${suggestion.content.slice(0, 60)}…` : suggestion.content
  const ringOffset = RING_CIRCUMFERENCE * (1 - countdown / COUNTDOWN_SECONDS)

  return (
    <div
      className={`fixed inset-x-0 bottom-0 flex justify-center z-50 transition-all duration-300 ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
    >
      <div className="w-[400px] max-w-[calc(100vw-2rem)] bg-fg text-white rounded-t-xl rounded-b-none shadow-lg p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">📝 {suggestion.sectionName}</p>
            <p className="text-xs text-white/70 mt-0.5 truncate">{preview}</p>
          </div>

          <svg width="32" height="32" viewBox="0 0 32 32" className="shrink-0">
            <circle cx="16" cy="16" r={RING_RADIUS} stroke="rgba(255,255,255,0.2)" strokeWidth="3" fill="none" />
            <circle
              cx="16"
              cy="16"
              r={RING_RADIUS}
              stroke="var(--accent)"
              strokeWidth="3"
              fill="none"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={ringOffset}
              strokeLinecap="round"
              transform="rotate(-90 16 16)"
              className="transition-[stroke-dashoffset] duration-1000 ease-linear"
            />
          </svg>
        </div>

        <div className="flex items-center justify-between mt-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAccept}
              className="bg-success text-white text-xs px-3 py-1.5 rounded-md hover:opacity-90"
            >
              Accept ✓
            </button>
            <button
              type="button"
              onClick={handleReject}
              className="border border-white/20 text-white/80 hover:bg-white/10 text-xs px-3 py-1.5 rounded-md"
            >
              Reject ✗
            </button>
          </div>
          <span className="text-[10px] text-white/50">Auto-accepting in {countdown}s</span>
        </div>
      </div>
    </div>
  )
}

export default ExtractionTooltip
// Named export too: room-workspace.tsx (owned by another agent) imports { ExtractionTooltip }.
export { ExtractionTooltip }
