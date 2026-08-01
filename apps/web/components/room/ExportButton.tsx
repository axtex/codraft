'use client'

import { Download } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

interface ExportButtonProps {
  roomId: string
  roomName: string
}

export function ExportButton({ roomId, roomName }: ExportButtonProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState<'markdown' | 'pdf' | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  async function exportMarkdown() {
    setLoading('markdown')
    try {
      const res = await fetch(`/api/rooms/${roomId}/export?format=markdown`)
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${roomName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'codraft'}.md`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } finally {
      setLoading(null)
      setOpen(false)
    }
  }

  function exportPdf() {
    setLoading('pdf')
    window.open(`/api/rooms/${roomId}/export?format=pdf`, '_blank')
    setLoading(null)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={loading !== null}
        className="btn-ghost flex items-center gap-1.5 text-sm"
        aria-label="Export document"
        aria-expanded={open}
      >
        <Download className="h-4 w-4" />
        <span className="hidden sm:inline">{loading ? 'Exporting…' : 'Export'}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 min-w-[200px] rounded-lg border border-border bg-bg-card py-1 shadow-lg">
          <button
            type="button"
            onClick={exportMarkdown}
            disabled={loading !== null}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-fg hover:bg-bg-surface disabled:opacity-50"
          >
            📄 Export as Markdown
          </button>
          <button
            type="button"
            onClick={exportPdf}
            disabled={loading !== null}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-fg hover:bg-bg-surface disabled:opacity-50"
          >
            🖨️ Export as PDF
          </button>
        </div>
      )}
    </div>
  )
}
