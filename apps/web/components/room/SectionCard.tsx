'use client'

import Collaboration from '@tiptap/extension-collaboration'
import Placeholder from '@tiptap/extension-placeholder'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import type { SectionData, SectionStatus } from '@codraft/shared'
import { formatDistanceToNow } from 'date-fns'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Socket } from 'socket.io-client'
import { useYjsSection } from '@/hooks/useYjsSection'

interface SectionCardProps {
  section: SectionData
  roomId: string
  socket: Socket | null
  currentUserId: string
  onAskClaude: (sectionName: string) => void
  initialYjsState?: number[]
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
  currentUserId,
  onAskClaude,
  initialYjsState,
}: SectionCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const { ydoc } = useYjsSection(socket, roomId, section.id, initialYjsState)
  const hasSeededContent = useRef(false)

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
      editor.commands.setContent(section.content)
    }
  }, [editor, initialYjsState, section.content])

  const badge = STATUS_BADGE[section.status]
  const showFooter = section.status === 'filled' || section.status === 'human_edited'

  return (
    <div className={`section-card section-card--${section.status}`}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <span className="text-sm font-medium text-fg">{section.name}</span>
        <div className="flex items-center gap-2">
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
          <div className="p-4 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_em]:italic [&_code]:font-mono [&_code]:text-xs [&_code]:bg-bg-elevated [&_code]:px-1 [&_code]:rounded text-sm text-fg">
            <EditorContent editor={editor} />
          </div>
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
    </div>
  )
}
