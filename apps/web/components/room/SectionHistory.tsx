'use client'

import { formatDistanceToNow } from 'date-fns'
import { X } from 'lucide-react'
import { useEffect, useState } from 'react'

interface SnapshotItem {
  id: string
  savedBy: string
  reason: string
  createdAt: string
  contentPreview: string
}

interface SectionHistoryProps {
  roomId: string
  sectionId: string
  sectionName: string
  isOpen: boolean
  onClose: () => void
}

const REASON_BADGE: Record<string, { label: string; className: string }> = {
  user_edit: { label: '✏️ Edited', className: 'bg-blue-500/15 text-blue-600' },
  claude_fill: { label: '✨ Claude', className: 'bg-indigo-500/15 text-indigo-600' },
  extraction_accepted: { label: '🎯 Extracted', className: 'bg-emerald-500/15 text-emerald-700' },
  revert: { label: '↩️ Reverted', className: 'bg-orange-500/15 text-orange-600' },
}

export function SectionHistory({
  roomId,
  sectionId,
  sectionName,
  isOpen,
  onClose,
}: SectionHistoryProps) {
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([])
  const [loading, setLoading] = useState(false)
  const [revertingId, setRevertingId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setLoading(true)
    fetch(`/api/rooms/${roomId}/sections/${sectionId}/history`)
      .then(async (res) => {
        if (!res.ok) return
        const data = (await res.json()) as { snapshots: SnapshotItem[] }
        if (!cancelled) setSnapshots(data.snapshots)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, roomId, sectionId])

  async function handleRevert(snapshotId: string) {
    if (!window.confirm('Revert to this version?')) return
    setRevertingId(snapshotId)
    try {
      const res = await fetch(`/api/rooms/${roomId}/sections/${sectionId}/history/revert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotId }),
      })
      if (!res.ok) return
      setToast('Reverted — refresh to see changes')
      setTimeout(() => setToast(null), 4000)
      onClose()
    } finally {
      setRevertingId(null)
    }
  }

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} aria-hidden />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-border bg-bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="truncate text-sm font-medium text-fg">History — {sectionName}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-fg-subtle hover:bg-bg-surface hover:text-fg"
            aria-label="Close history"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loading && <p className="text-sm text-fg-muted">Loading…</p>}

          {!loading && snapshots.length === 0 && (
            <div className="px-2 py-8 text-center">
              <p className="text-sm font-medium text-fg">No history yet</p>
              <p className="mt-1 text-xs text-fg-muted">
                History saves automatically as sections are edited
              </p>
            </div>
          )}

          {!loading &&
            snapshots.map((snap) => {
              const badge = REASON_BADGE[snap.reason] ?? {
                label: snap.reason,
                className: 'bg-bg-elevated text-fg-muted',
              }
              const savedLabel =
                snap.savedBy === 'claude' || snap.savedBy === 'extraction'
                  ? 'Claude'
                  : snap.savedBy.slice(0, 8)

              return (
                <div
                  key={snap.id}
                  className="mb-3 rounded-lg border border-border bg-bg-surface p-3"
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                      {badge.label}
                    </span>
                    <span className="text-xs text-fg-subtle">
                      {formatDistanceToNow(new Date(snap.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="mb-1 text-xs text-fg-muted">by {savedLabel}</p>
                  <p className="mb-2 line-clamp-2 text-xs text-fg-subtle whitespace-pre-wrap">
                    {snap.contentPreview || '—'}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleRevert(snap.id)}
                    disabled={revertingId === snap.id}
                    className="btn-ghost text-xs disabled:opacity-50"
                  >
                    {revertingId === snap.id ? 'Reverting…' : 'Revert to this'}
                  </button>
                </div>
              )
            })}
        </div>

        <p className="border-t border-border px-4 py-2 text-xs text-fg-subtle">
          Changes will reflect after refresh
        </p>
      </aside>

      {toast && (
        <div className="fixed bottom-4 right-4 z-[60] rounded-lg border border-border bg-bg-card px-4 py-2 text-sm text-fg shadow-lg">
          {toast}
        </div>
      )}
    </>
  )
}
