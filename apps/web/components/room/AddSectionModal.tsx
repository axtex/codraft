'use client'

import type { SectionData } from '@codraft/shared'
import { useState } from 'react'
import type { Socket } from 'socket.io-client'

interface AddSectionModalProps {
  roomId: string
  socket: Socket | null
  isOpen: boolean
  onClose: () => void
  onCreated: (section: SectionData) => void
}

export default function AddSectionModal({ roomId, socket, isOpen, onClose, onCreated }: AddSectionModalProps) {
  const [name, setName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setIsSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/rooms/${roomId}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (!res.ok) throw new Error('Failed to create section')
      const data: { section: SectionData } = await res.json()
      socket?.emit('add-section', roomId, data.section)
      onCreated(data.section)
      setName('')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="card p-6 max-w-sm w-full">
        <h2 className="text-sm font-semibold text-fg mb-3">Add Section</h2>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit()
          }}
          placeholder="Section name"
          autoFocus
          className="w-full bg-bg-surface border border-border rounded-md px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent"
        />
        {error && <p className="text-xs text-danger mt-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className="btn-ghost text-xs">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !name.trim()}
            className="btn-primary text-xs"
          >
            {isSubmitting ? 'Adding...' : 'Add Section'}
          </button>
        </div>
      </div>
    </div>
  )
}
