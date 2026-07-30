'use client'

import type { ChatMessage, RoomMemberInfo, SectionData } from '@codraft/shared'
import { ArrowUp } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Socket } from 'socket.io-client'
import MessageBubble from './MessageBubble'

interface ChatPanelProps {
  roomId: string
  sections: SectionData[]
  socket: Socket | null
  isConnected: boolean
  currentUserId: string
  currentUserName: string
  initialMessages: ChatMessage[]
  presence: RoomMemberInfo[]
  // Optional: lets a parent (e.g. "Ask Claude" buttons elsewhere) focus the composer.
  inputRef?: React.RefObject<HTMLTextAreaElement>
}

interface MentionOption {
  key: string
  label: string // text inserted after '@'
  hint: string // small descriptor shown in dropdown
}

const NEAR_BOTTOM_THRESHOLD = 80

function ChatPanel({
  roomId,
  sections,
  socket,
  isConnected,
  currentUserId,
  currentUserName,
  initialMessages,
  presence,
  inputRef: externalInputRef,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [streamingText, setStreamingText] = useState('')
  const [inputValue, setInputValue] = useState('')
  const [showNewMessagesPill, setShowNewMessagesPill] = useState(false)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [isSending, setIsSending] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const ownTextareaRef = useRef<HTMLTextAreaElement>(null)
  const textareaRef = externalInputRef ?? ownTextareaRef
  const isNearBottomRef = useRef(true)

  useEffect(() => {
    setMessages(initialMessages)
  }, [initialMessages])

  const onlineCount = presence.filter((p) => p.isOnline).length

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    setShowNewMessagesPill(false)
  }

  const checkNearBottom = () => {
    const el = scrollContainerRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD
  }

  const handleScroll = () => {
    isNearBottomRef.current = checkNearBottom()
    if (isNearBottomRef.current) setShowNewMessagesPill(false)
  }

  useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    } else if (messages.length > 0) {
      setShowNewMessagesPill(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length])

  useEffect(() => {
    if (!socket) return

    const handleNewMessage = (message: ChatMessage) => {
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]))
      if (message.type === 'AI') setStreamingText('')
    }

    const handleChunk = (data: { chunk: string }) => {
      setStreamingText((prev) => prev + data.chunk)
    }

    socket.on('new-message', handleNewMessage)
    socket.on('ai-response-chunk', handleChunk)

    return () => {
      socket.off('new-message', handleNewMessage)
      socket.off('ai-response-chunk', handleChunk)
    }
  }, [socket])

  // Auto-resize textarea up to ~5 lines.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const maxHeight = 5 * 20 + 16 // approx line-height * lines + padding
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
  }, [inputValue])

  const mentionOptions = useMemo<MentionOption[]>(() => {
    const opts: MentionOption[] = [{ key: 'claude', label: 'Claude', hint: 'AI' }]
    presence
      .filter((p) => p.isOnline && p.userId !== currentUserId)
      .forEach((p) => opts.push({ key: `user-${p.userId}`, label: p.name, hint: 'member' }))
    sections.forEach((s) => opts.push({ key: `section-${s.id}`, label: s.name, hint: 'section' }))
    return opts
  }, [presence, sections, currentUserId])

  const filteredMentionOptions = useMemo(() => {
    if (mentionQuery === null) return []
    const q = mentionQuery.toLowerCase()
    return mentionOptions.filter((o) => o.label.toLowerCase().startsWith(q))
  }, [mentionOptions, mentionQuery])

  const detectMention = (value: string, cursorPos: number) => {
    const upToCursor = value.slice(0, cursorPos)
    const atIndex = upToCursor.lastIndexOf('@')
    if (atIndex === -1) {
      setMentionQuery(null)
      return
    }
    const candidate = upToCursor.slice(atIndex + 1)
    if (/\s/.test(candidate)) {
      setMentionQuery(null)
      return
    }
    setMentionQuery(candidate)
    setMentionIndex(0)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setInputValue(value)
    detectMention(value, e.target.selectionStart ?? value.length)
  }

  const insertMention = (option: MentionOption) => {
    const el = textareaRef.current
    const cursorPos = el?.selectionStart ?? inputValue.length
    const upToCursor = inputValue.slice(0, cursorPos)
    const atIndex = upToCursor.lastIndexOf('@')
    if (atIndex === -1) return
    const before = inputValue.slice(0, atIndex)
    const after = inputValue.slice(cursorPos)
    const newValue = `${before}@${option.label} ${after}`
    setInputValue(newValue)
    setMentionQuery(null)
    requestAnimationFrame(() => {
      const newCursorPos = before.length + option.label.length + 2
      el?.focus()
      el?.setSelectionRange(newCursorPos, newCursorPos)
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null && filteredMentionOptions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex((i) => (i + 1) % filteredMentionOptions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex((i) => (i - 1 + filteredMentionOptions.length) % filteredMentionOptions.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(filteredMentionOptions[mentionIndex])
        return
      }
      if (e.key === 'Escape') {
        setMentionQuery(null)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const sendMessage = () => {
    const trimmed = inputValue.trim()
    if (!trimmed || !isConnected || !socket) return
    setIsSending(true)
    socket.emit('send-message', roomId, trimmed, currentUserId, currentUserName)
    setInputValue('')
    setMentionQuery(null)
    // No optimistic add — new-message broadcast will append it.
    setTimeout(() => setIsSending(false), 300)
  }

  const canSend = inputValue.trim().length > 0 && isConnected && !isSending

  return (
    <div className="flex flex-col h-full">
      <div className="h-10 border-b border-border flex items-center justify-between px-4 shrink-0">
        <span className="text-sm font-medium text-fg">Chat</span>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-success" />
          <span className="text-xs text-fg-muted">{onlineCount} online</span>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-3 relative"
      >
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} currentUserId={currentUserId} />
        ))}

        {streamingText !== null && streamingText !== '' && (
          <div className="flex justify-start">
            <div className="max-w-[85%] sm:max-w-[75%] bg-bg-card border border-border rounded-lg px-3 py-2 text-sm text-fg">
              {streamingText}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {showNewMessagesPill && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute left-1/2 -translate-x-1/2 bottom-24 bg-accent text-white text-xs px-3 py-1.5 rounded-full shadow-md hover:opacity-90"
        >
          ↓ New messages
        </button>
      )}

      <div className="border-t border-border p-3 shrink-0 relative">
        {mentionQuery !== null && filteredMentionOptions.length > 0 && (
          <div className="absolute bottom-full left-3 right-3 mb-2 bg-bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto z-10">
            {filteredMentionOptions.map((option, idx) => (
              <button
                key={option.key}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  insertMention(option)
                }}
                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between ${
                  idx === mentionIndex ? 'bg-accent-muted text-accent' : 'text-fg hover:bg-bg-surface'
                }`}
              >
                <span>@{option.label}</span>
                <span className="text-xs text-fg-subtle">{option.hint}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Message your team and Claude..."
            rows={1}
            className="flex-1 resize-none bg-bg-surface border border-border rounded-lg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={!canSend}
            className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg bg-accent text-white transition hover:bg-accent-bright disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Send message"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-fg-subtle mt-1.5">
          Try: &quot;Claude, add our hotel budget to the doc&quot;
        </p>
      </div>
    </div>
  )
}

export default ChatPanel
// Named export too: room-workspace.tsx (owned by another agent) imports { ChatPanel }.
export { ChatPanel }
