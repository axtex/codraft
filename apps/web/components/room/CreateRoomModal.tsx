'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { TEMPLATES } from '@/lib/templates'
import { generateSlug, generateFullSlug } from '@/lib/room-utils'
import { detectTemplate } from '@/lib/templates'
import type { RoomTemplate } from '@codraft/shared'

interface CreateRoomModalProps {
  isOpen: boolean
  onClose: () => void
  username: string
}

type Step = 'name' | 'settings'

const TEMPLATE_KEYS = Object.keys(TEMPLATES) as RoomTemplate[]

export function CreateRoomModal({ isOpen, onClose, username }: CreateRoomModalProps) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('name')
  const [name, setName] = useState('')
  const [template, setTemplate] = useState<RoomTemplate | null>(null)
  const [templateTouched, setTemplateTouched] = useState(false)
  const [linkSharingEnabled, setLinkSharingEnabled] = useState(true)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const effectiveTemplate = template ?? (name ? detectTemplate(name) : 'custom')
  const slugPreview = name ? generateFullSlug(username, generateSlug(name)) : ''

  function reset() {
    setStep('name')
    setName('')
    setTemplate(null)
    setTemplateTouched(false)
    setLinkSharingEnabled(true)
    setProgress(null)
    setError(null)
  }

  function close() {
    reset()
    onClose()
  }

  async function handleCreate() {
    setError(null)
    setProgress('Creating room...')
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, template: effectiveTemplate, linkSharingEnabled }),
      })
      setProgress('Generating sections...')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to create room')
      }
      const data = await res.json()
      setProgress('Setting up workspace...')
      router.push(`/room/${data.room.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setProgress(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="card w-full max-w-md p-6">
        {step === 'name' && (
          <>
            <h2 className="text-lg font-semibold text-fg">Create a room</h2>
            <label className="mt-4 block text-sm font-medium text-fg">Room name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tokyo Trip 2026"
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-base outline-none focus:border-accent"
            />
            {slugPreview && (
              <p className="mt-1 text-xs text-fg-subtle">{slugPreview}</p>
            )}

            <p className="mt-5 text-sm font-medium text-fg">Template</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {TEMPLATE_KEYS.map((key) => {
                const tpl = TEMPLATES[key]
                const selected = effectiveTemplate === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setTemplate(key)
                      setTemplateTouched(true)
                    }}
                    className={`rounded-md border p-2 text-left text-xs transition ${
                      selected
                        ? 'border-accent bg-accent-muted'
                        : 'border-border hover:bg-bg-surface'
                    }`}
                  >
                    <div className="text-base">{tpl.icon}</div>
                    <div className="mt-1 font-medium text-fg">{tpl.label}</div>
                    <div className="text-fg-subtle">{tpl.sections.length} sections</div>
                  </button>
                )
              })}
            </div>
            {!templateTouched && name && (
              <p className="mt-2 text-xs text-fg-subtle">
                Auto-detected from name — click a template to override.
              </p>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button className="btn-ghost" onClick={close}>
                Cancel
              </button>
              <button
                className="btn-primary"
                disabled={!name.trim()}
                onClick={() => setStep('settings')}
              >
                Continue →
              </button>
            </div>
          </>
        )}

        {step === 'settings' && (
          <>
            <h2 className="text-lg font-semibold text-fg">Visibility</h2>
            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={() => setLinkSharingEnabled(true)}
                className={`w-full rounded-md border p-3 text-left text-sm transition ${
                  linkSharingEnabled ? 'border-accent bg-accent-muted' : 'border-border'
                }`}
              >
                <div className="font-medium text-fg">🔗 Anyone with link</div>
                <div className="text-xs text-fg-subtle">Anyone with the invite link can join</div>
              </button>
              <button
                type="button"
                onClick={() => setLinkSharingEnabled(false)}
                className={`w-full rounded-md border p-3 text-left text-sm transition ${
                  !linkSharingEnabled ? 'border-accent bg-accent-muted' : 'border-border'
                }`}
              >
                <div className="font-medium text-fg">🔒 Invite only</div>
                <div className="text-xs text-fg-subtle">You add members manually</div>
              </button>
            </div>

            {error && <p className="mt-4 text-xs text-danger">{error}</p>}

            <div className="mt-6 flex justify-between gap-2">
              <button className="btn-ghost" onClick={() => setStep('name')} disabled={!!progress}>
                ← Back
              </button>
              <button className="btn-primary" onClick={handleCreate} disabled={!!progress}>
                {progress ?? 'Create Room'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
