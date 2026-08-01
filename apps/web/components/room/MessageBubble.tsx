'use client'

import type { ChatMessage } from '@codraft/shared'
import { formatDistanceToNow } from 'date-fns'
import { Sparkles } from 'lucide-react'
import React from 'react'

// Minimal markdown renderer: bold, italic, inline code, unordered lists, fenced code blocks.
// Intentionally not a full parser — chat messages are short and don't need one.
function renderMinimalMarkdown(
  text: string,
  onSectionClick?: (sectionName: string) => void,
  knownSections?: string[],
  knownUsers?: string[]
): React.ReactNode {
  const blocks = text.split(/```/)

  return blocks.map((block, blockIdx) => {
    const isCodeBlock = blockIdx % 2 === 1
    if (isCodeBlock) {
      return (
        <pre
          key={blockIdx}
          className="font-mono text-xs bg-bg-elevated rounded p-2 my-1 overflow-x-auto"
        >
          <code>{block.replace(/^\w*\n/, '')}</code>
        </pre>
      )
    }

    const lines = block.split('\n')
    return (
      <React.Fragment key={blockIdx}>
        {lines.map((line, lineIdx) => {
          if (/^[-*]\s+/.test(line)) {
            return (
              <li key={lineIdx} className="ml-4 list-disc">
                {renderInline(line.replace(/^[-*]\s+/, ''), onSectionClick, knownSections, knownUsers)}
              </li>
            )
          }
          if (line.trim() === '') {
            return lineIdx < lines.length - 1 ? <br key={lineIdx} /> : null
          }
          return (
            <span key={lineIdx}>
              {renderInline(line, onSectionClick, knownSections, knownUsers)}
              {lineIdx < lines.length - 1 && <br />}
            </span>
          )
        })}
      </React.Fragment>
    )
  })
}

function resolveMentionAt(
  text: string,
  atIndex: number,
  knownSections?: string[],
  knownUsers?: string[]
): { label: string; kind: 'claude' | 'section' | 'user' | 'unknown'; matched: string } | null {
  if (text[atIndex] !== '@') return null
  const rest = text.slice(atIndex + 1)
  if (!rest) return null

  type MentionKind = 'claude' | 'section' | 'user'
  const candidates: { label: string; kind: MentionKind }[] = [
    { label: 'Claude', kind: 'claude' },
    ...(knownSections ?? []).map((s): { label: string; kind: MentionKind } => ({
      label: s,
      kind: 'section',
    })),
    ...(knownUsers ?? []).map((u): { label: string; kind: MentionKind } => ({
      label: u,
      kind: 'user',
    })),
  ]
  candidates.sort((a, b) => b.label.length - a.label.length)

  for (const c of candidates) {
    if (rest.toLowerCase().startsWith(c.label.toLowerCase())) {
      const after = rest[c.label.length]
      // Require end-of-token (whitespace / punctuation / EOS) so "@ClaudeX" isn't a hit.
      if (after === undefined || /[\s.,!?;:)\]}]/.test(after)) {
        return { label: c.label, kind: c.kind, matched: `@${c.label}` }
      }
    }
  }

  // Fallback: single-token @mention (no spaces).
  const token = rest.match(/^[A-Za-z0-9_-]+/)
  if (!token) return null
  return { label: token[0], kind: 'unknown', matched: `@${token[0]}` }
}

function renderInline(
  text: string,
  onSectionClick?: (sectionName: string) => void,
  knownSections?: string[],
  knownUsers?: string[]
): React.ReactNode {
  const nodes: React.ReactNode[] = []
  let i = 0
  let key = 0

  while (i < text.length) {
    const at = text.indexOf('@', i)
    if (at === -1) {
      nodes.push(renderMarkdownInline(text.slice(i), key++))
      break
    }
    if (at > i) {
      nodes.push(renderMarkdownInline(text.slice(i, at), key++))
    }
    const resolved = resolveMentionAt(text, at, knownSections, knownUsers)
    if (!resolved) {
      nodes.push(renderMarkdownInline('@', key++))
      i = at + 1
      continue
    }
    nodes.push(renderMentionPill(resolved, key++, onSectionClick))
    i = at + resolved.matched.length
  }

  return nodes
}

function renderMentionPill(
  resolved: { label: string; kind: 'claude' | 'section' | 'user' | 'unknown' },
  key: number,
  onSectionClick?: (sectionName: string) => void
): React.ReactNode {
  if (resolved.kind === 'claude') {
    return (
      <span
        key={key}
        className="inline-flex items-center rounded-full bg-indigo-500/15 px-1.5 py-0.5 text-xs font-medium text-indigo-600"
      >
        @Claude
      </span>
    )
  }

  if (resolved.kind === 'section') {
    return (
      <button
        key={key}
        type="button"
        onClick={() => onSectionClick?.(resolved.label)}
        className="inline-flex items-center rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-500/25"
      >
        @{resolved.label}
      </button>
    )
  }

  return (
    <span
      key={key}
      className="inline-flex items-center rounded-full bg-blue-500/15 px-1.5 py-0.5 text-xs font-medium text-blue-600"
    >
      @{resolved.label}
    </span>
  )
}

function renderMarkdownInline(text: string, keyOffset: number): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
  return parts.map((part, idx) => {
    const key = `${keyOffset}-${idx}`
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={key}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={key} className="font-mono text-xs bg-bg-elevated px-1 rounded">
          {part.slice(1, -1)}
        </code>
      )
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={key}>{part.slice(1, -1)}</em>
    }
    return <React.Fragment key={key}>{part}</React.Fragment>
  })
}

interface MessageBubbleProps {
  message: ChatMessage
  currentUserId: string
  onSectionClick?: (sectionName: string) => void
  knownSections?: string[]
  knownUsers?: string[]
}

export default function MessageBubble({
  message,
  currentUserId,
  onSectionClick,
  knownSections,
  knownUsers,
}: MessageBubbleProps) {
  const relativeTime = formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })

  if (message.type === 'SYSTEM') {
    return (
      <div className="text-center text-xs text-fg-subtle py-1">
        {message.content} · {relativeTime}
      </div>
    )
  }

  if (message.type === 'EXTRACTION') {
    // Lasting chat breadcrumb (e.g. "Added to Overview") — not the auto-dismiss
    // extraction tooltip. Stays in history across reloads.
    const sectionName = message.content.replace(/^Added to\s+/i, '').trim()
    return (
      <div className="flex justify-center py-1">
        <button
          type="button"
          onClick={() => onSectionClick?.(sectionName || message.content)}
          className="bg-accent-muted text-accent text-xs rounded-full px-3 py-1 hover:opacity-80 transition-opacity"
        >
          📝 {message.content}
        </button>
      </div>
    )
  }

  if (message.type === 'AI') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] sm:max-w-[75%]">
          <div className="flex items-center gap-1.5 mb-1">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            <span className="text-xs font-medium text-fg-muted">Claude</span>
            <span className="text-xs text-fg-subtle">{relativeTime}</span>
          </div>
          <div className="bg-bg-card border border-border rounded-lg px-3 py-2 text-sm text-fg">
            {renderMinimalMarkdown(message.content, onSectionClick, knownSections, knownUsers)}
          </div>
        </div>
      </div>
    )
  }

  // USER
  const isOwn = message.userId === currentUserId
  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[85%] sm:max-w-[75%]">
        <div className={`flex items-center gap-1.5 mb-1 ${isOwn ? 'flex-row-reverse' : ''}`}>
          {message.userImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={message.userImage}
              alt={message.userName}
              className="h-6 w-6 rounded-full object-cover"
            />
          ) : (
            <div className="h-6 w-6 rounded-full bg-accent-muted text-accent flex items-center justify-center text-xs font-medium">
              {message.userName[0]?.toUpperCase() ?? '?'}
            </div>
          )}
          <span className="text-xs font-medium text-fg-muted">{message.userName}</span>
          <span className="text-xs text-fg-subtle">{relativeTime}</span>
        </div>
        <div
          className={`rounded-lg px-3 py-2 text-sm text-fg ${
            isOwn ? 'bg-accent-muted' : 'bg-bg-surface'
          }`}
        >
          {renderMinimalMarkdown(message.content, onSectionClick, knownSections, knownUsers)}
        </div>
      </div>
    </div>
  )
}
