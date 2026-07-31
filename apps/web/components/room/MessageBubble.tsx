'use client'

import type { ChatMessage } from '@codraft/shared'
import { formatDistanceToNow } from 'date-fns'
import { Sparkles } from 'lucide-react'
import React from 'react'

// Minimal markdown renderer: bold, italic, inline code, unordered lists, fenced code blocks.
// Intentionally not a full parser — chat messages are short and don't need one.
function renderMinimalMarkdown(text: string): React.ReactNode {
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
                {renderInline(line.replace(/^[-*]\s+/, ''))}
              </li>
            )
          }
          if (line.trim() === '') {
            return lineIdx < lines.length - 1 ? <br key={lineIdx} /> : null
          }
          return (
            <span key={lineIdx}>
              {renderInline(line)}
              {lineIdx < lines.length - 1 && <br />}
            </span>
          )
        })}
      </React.Fragment>
    )
  })
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={idx} className="font-mono text-xs bg-bg-elevated px-1 rounded">
          {part.slice(1, -1)}
        </code>
      )
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={idx}>{part.slice(1, -1)}</em>
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>
  })
}

interface MessageBubbleProps {
  message: ChatMessage
  currentUserId: string
  onSectionClick?: (sectionName: string) => void
}

export default function MessageBubble({ message, currentUserId, onSectionClick }: MessageBubbleProps) {
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
            {renderMinimalMarkdown(message.content)}
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
          {renderMinimalMarkdown(message.content)}
        </div>
      </div>
    </div>
  )
}
