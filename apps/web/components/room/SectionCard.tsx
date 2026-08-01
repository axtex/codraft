'use client'

import Collaboration from '@tiptap/extension-collaboration'
import Placeholder from '@tiptap/extension-placeholder'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import type { ExtractionSuggestion, SectionData, SectionStatus } from '@codraft/shared'
import { formatDistanceToNow } from 'date-fns'
import { Check, ChevronDown, ChevronUp, History, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Socket } from 'socket.io-client'
import { useYjsSection } from '@/hooks/useYjsSection'
import { markdownToHtml } from '@/lib/markdown'
import { SectionHistory } from './SectionHistory'

interface SectionCardProps {
  section: SectionData
  roomId: string
  socket: Socket | null
  currentUserId: string
  onAskClaude: (sectionName: string) => void
  initialYjsState?: number[]
  pendingSuggestion?: ExtractionSuggestion | null
}

const STATUS_BADGE: Record<SectionStatus, { label: string; className: string }> = {
  empty: { label: 'Empty', className: 'bg-bg-elevated text-fg-subtle' },
  in_progress: { label: 'Writing...', className: 'bg-warning/10 text-warning animate-pulse' },
  filled: { label: 'Filled ✓', className: 'bg-success/10 text-success' },
  human_edited: { label: 'Edited', className: 'bg-accent-muted text-accent' },
}

export default function SectionCard({
  section,
  roomId,
  socket,
  currentUserId: _currentUserId,
  onAskClaude,
  initialYjsState,
  pendingSuggestion = null,
}: SectionCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isResolving, setIsResolving] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const { ydoc } = useYjsSection(socket, roomId, section.id, initialYjsState)
  const hasSeededContent = useRef(false)
  // Tracks the last content applied from section props (seed or Claude fill),
  // so we don't fight live collaborative edits that only live in Yjs.
  const lastAppliedFromProps = useRef<string | null>(null)

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ history: false }),
        Collaboration.configure({ document: ydoc }),
        Placeholder.configure({
          placeholder: 'Empty — ask Claude to fill this, or start writing...',
        }),
      ],
      immediatelyRender: false,
    },
    [ydoc]
  )

  // Seed initial plain-text content once, only if this section had no persisted
  // Yjs state (i.e. the doc's collaborative fragment is genuinely fresh).
  useEffect(() => {
    if (!editor || hasSeededContent.current) return
    hasSeededContent.current = true
    const noPersistedState = !initialYjsState || initialYjsState.length === 0
    if (noPersistedState && section.content && editor.isEmpty) {
      lastAppliedFromProps.current = section.content
      // Claude/AI init store markdown; TipTap needs HTML nodes.
      editor.commands.setContent(markdownToHtml(section.content))
    }
  }, [editor, initialYjsState, section.content])

  // When Claude (or accept-suggestion) updates section.content via socket,
  // push it into TipTap. Server-side Y.Text writes never reach Collaboration's
  // XmlFragment, so the editor must apply content from `section-updated`.
  useEffect(() => {
    if (!editor || !section.content) return
    if (lastAppliedFromProps.current === section.content) return
    // Skip until seed effect has had a chance to run for empty docs.
    if (!hasSeededContent.current) return
    if (editor.getText().trim() === section.content.trim()) {
      lastAppliedFromProps.current = section.content
      return
    }
    lastAppliedFromProps.current = section.content
    editor.commands.setContent(markdownToHtml(section.content))
  }, [editor, section.content, section.updatedAt])

  // Expand so the pending highlight is visible.
  useEffect(() => {
    if (pendingSuggestion) setIsCollapsed(false)
  }, [pendingSuggestion])

  async function handleAcceptSuggestion() {
    if (!pendingSuggestion || isResolving) return
    const current = pendingSuggestion
    setIsResolving(true)
    try {
      const res = await fetch(`/api/rooms/${roomId}/suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionId: current.id }),
      })
      if (!res.ok) return
      const data = (await res.json()) as { section: { content: string } }
      // Socket broadcasts the appended body + clears pending for everyone.
      socket?.emit(
        'accept-suggestion',
        roomId,
        current.id,
        current.sectionId,
        data.section.content
      )
    } finally {
      setIsResolving(false)
    }
  }

  async function handleRejectSuggestion() {
    if (!pendingSuggestion || isResolving) return
    const current = pendingSuggestion
    setIsResolving(true)
    try {
      await fetch(`/api/rooms/${roomId}/suggestions`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionId: current.id }),
      })
      socket?.emit('reject-suggestion', roomId, current.id)
    } finally {
      setIsResolving(false)
    }
  }

  const badge = STATUS_BADGE[section.status]
  const showFooter = section.status === 'filled' || section.status === 'human_edited'

  return (
    <div
      id={`section-${section.id}`}
      data-section-name={section.name}
      className={`section-card section-card--${section.status} group`}
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <span className="text-sm font-medium text-fg">{section.name}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="text-fg-subtle opacity-0 transition-opacity hover:text-fg group-hover:opacity-100 focus:opacity-100"
            aria-label="Section history"
            title="History"
          >
            <History className="h-4 w-4" />
          </button>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.className}`}>
            {badge.label}
          </span>
          <button
            type="button"
            onClick={() => setIsCollapsed((c) => !c)}
            className="text-fg-subtle hover:text-fg"
            aria-label={isCollapsed ? 'Expand section' : 'Collapse section'}
          >
            {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          <div className="p-4 pb-2 text-sm text-fg [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-1.5 [&_h3]:text-sm [&_h3]:font-semibold [&_p]:mb-2 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-0.5 [&_strong]:font-semibold [&_em]:italic [&_code]:rounded [&_code]:bg-bg-elevated [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs">
            <EditorContent editor={editor} />
          </div>

          {pendingSuggestion && (
            <div className="px-4 pb-2">
              <div className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-accent-muted px-2 py-1 text-sm text-fg">
                <span className="min-w-0 break-words text-accent">{pendingSuggestion.content}</span>
                <button
                  type="button"
                  onClick={handleAcceptSuggestion}
                  disabled={isResolving}
                  className="shrink-0 rounded p-0.5 text-success hover:bg-success/10 disabled:opacity-50"
                  aria-label="Accept suggestion"
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                </button>
                <button
                  type="button"
                  onClick={handleRejectSuggestion}
                  disabled={isResolving}
                  className="shrink-0 rounded p-0.5 text-fg-muted hover:bg-fg/5 hover:text-fg disabled:opacity-50"
                  aria-label="Reject suggestion"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                </button>
              </div>
            </div>
          )}

          <div className="px-4 pb-3">
            <button type="button" onClick={() => onAskClaude(section.name)} className="btn-ghost text-xs">
              ✨ Ask Claude to fill
            </button>
          </div>
        </>
      )}

      {showFooter && (
        <div className="text-xs text-fg-subtle px-4 py-2 border-t border-border">
          Last updated by {section.updatedBy === 'claude' ? 'Claude' : (section.updatedBy ?? 'system')} ·{' '}
          {formatDistanceToNow(new Date(section.updatedAt), { addSuffix: true })}
        </div>
      )}

      <SectionHistory
        roomId={roomId}
        sectionId={section.id}
        sectionName={section.name}
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />
    </div>
  )
}
