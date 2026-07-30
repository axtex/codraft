'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

interface Member {
  userId: string
  name: string
  image?: string
  role: string
}

interface ShareModalProps {
  isOpen: boolean
  onClose: () => void
  inviteUrl: string
  isPublic: boolean
  isOwner: boolean
  members: Member[]
  onTogglePublic: (isPublic: boolean) => void
}

export function ShareModal({
  isOpen,
  onClose,
  inviteUrl,
  isPublic,
  isOwner,
  members,
  onTogglePublic,
}: ShareModalProps) {
  const [copied, setCopied] = useState(false)

  if (!isOpen) return null

  async function copyLink() {
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-fg">Share this room</h2>

        <div className="mt-4">
          <label className="text-xs font-medium text-fg-muted">Invite link</label>
          <div className="mt-1 flex gap-2">
            <input
              readOnly
              value={inviteUrl}
              className="flex-1 truncate rounded-md border border-border bg-bg-surface px-3 py-2 text-xs text-fg-muted"
            />
            <button className="btn-ghost px-3" onClick={copyLink} aria-label="Copy invite link">
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
          <p className="mt-1 text-xs text-fg-subtle">
            Anyone with this link can join as Editor
          </p>
        </div>

        {isOwner && (
          <div className="mt-5">
            <label className="text-xs font-medium text-fg-muted">Visibility</label>
            <div className="mt-1 flex gap-2">
              <button
                className={`flex-1 rounded-md border px-3 py-2 text-xs font-medium transition ${
                  !isPublic ? 'border-accent bg-accent-muted text-accent' : 'border-border text-fg-muted'
                }`}
                onClick={() => onTogglePublic(false)}
              >
                Private
              </button>
              <button
                className={`flex-1 rounded-md border px-3 py-2 text-xs font-medium transition ${
                  isPublic ? 'border-accent bg-accent-muted text-accent' : 'border-border text-fg-muted'
                }`}
                onClick={() => onTogglePublic(true)}
              >
                Public
              </button>
            </div>
          </div>
        )}

        <div className="mt-5">
          <label className="text-xs font-medium text-fg-muted">Members</label>
          <ul className="mt-2 space-y-2">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[10px] font-medium text-white">
                    {m.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.image} alt={m.name} className="h-full w-full rounded-full" />
                    ) : (
                      m.name[0]?.toUpperCase()
                    )}
                  </div>
                  <span className="text-sm text-fg">{m.name}</span>
                </div>
                <span className="rounded-full bg-bg-elevated px-2 py-0.5 text-[10px] font-medium text-fg-subtle">
                  {m.role}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 flex justify-end">
          <button className="btn-ghost" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
