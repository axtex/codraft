'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { Trash2 } from 'lucide-react'
import { TEMPLATES } from '@/lib/templates'
import { AuthControls } from '@/components/AuthControls'
import { CreateRoomModal } from '@/components/room/CreateRoomModal'
import type { RoomTemplate } from '@codraft/shared'

interface RoomSummary {
  id: string
  name: string
  fullSlug: string
  template: string
  linkSharingEnabled: boolean
  updatedAt: string
  members: { userId: string; name: string; image?: string }[]
  sectionCount: number
  filledSectionCount: number
  lastMessage: { content: string; createdAt: string } | null
  isOwner: boolean
}

export function DashboardClient({
  rooms,
  username,
  userName,
  userImage,
}: {
  rooms: RoomSummary[]
  username: string
  userName: string
  userImage?: string
}) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [roomList, setRoomList] = useState(rooms)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const router = useRouter()
  const shouldCreate = searchParams.get('create')

  useEffect(() => {
    setRoomList(rooms)
  }, [rooms])

  useEffect(() => {
    if (shouldCreate === 'true') {
      setIsModalOpen(true)
      router.replace('/dashboard', { scroll: false })
    }
  }, [shouldCreate, router])

  async function deleteRoom(room: RoomSummary) {
    if (!window.confirm(`Delete “${room.name}”? This cannot be undone.`)) return
    setDeletingId(room.id)
    try {
      const res = await fetch(`/api/rooms/${room.id}`, { method: 'DELETE' })
      if (!res.ok) return
      setRoomList((prev) => prev.filter((r) => r.id !== room.id))
      router.refresh()
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <Link href="/dashboard" className="font-bold text-fg">
          codraft
        </Link>
        <AuthControls name={userName} image={userImage} />
      </header>

      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-fg">My Rooms</h1>
        <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
          + New Room
        </button>
      </div>

      {roomList.length === 0 ? (
        <div className="mt-16 flex flex-col items-center text-center">
          <div className="text-5xl">📄</div>
          <p className="mt-4 text-lg font-medium text-fg">No rooms yet</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {roomList.map((room) => {
            const tpl = TEMPLATES[room.template as RoomTemplate] ?? TEMPLATES.custom
            return (
              <div key={room.id} className="card relative p-5 transition hover:border-border-bright">
                <Link
                  href={`/room/${room.id}`}
                  className="absolute inset-0 rounded-lg"
                  aria-label={`Open ${room.name}`}
                />
                <div className="relative flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-xl">{tpl.icon}</span>
                    <span className="truncate font-semibold text-fg">{room.name}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        room.linkSharingEnabled
                          ? 'bg-success/10 text-success'
                          : 'bg-bg-elevated text-fg-subtle'
                      }`}
                    >
                      {room.linkSharingEnabled ? 'Anyone with link' : 'Invite only'}
                    </span>
                    {room.isOwner && (
                      <button
                        type="button"
                        onClick={() => deleteRoom(room)}
                        disabled={deletingId === room.id}
                        className="relative z-10 rounded p-1 text-fg-subtle hover:bg-bg-surface hover:text-danger disabled:opacity-40"
                        aria-label={`Delete ${room.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="relative mt-1 text-xs text-fg-subtle">{room.fullSlug}</p>

                <div className="relative mt-3 flex -space-x-2">
                  {room.members.slice(0, 4).map((m) => (
                    <div
                      key={m.userId}
                      title={m.name}
                      className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-bg-card bg-accent text-[10px] font-medium text-white"
                    >
                      {m.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.image} alt={m.name} className="h-full w-full rounded-full" />
                      ) : (
                        m.name[0]?.toUpperCase()
                      )}
                    </div>
                  ))}
                </div>

                <p className="relative mt-3 text-xs text-fg-muted">
                  {room.filledSectionCount}/{room.sectionCount} sections filled
                </p>

                {room.lastMessage && (
                  <p className="relative mt-2 truncate text-xs text-fg-subtle">
                    {room.lastMessage.content} ·{' '}
                    {formatDistanceToNow(new Date(room.lastMessage.createdAt), { addSuffix: true })}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      <CreateRoomModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} username={username} />
      </div>
    </div>
  )
}
