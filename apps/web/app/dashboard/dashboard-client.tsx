'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { TEMPLATES } from '@/lib/templates'
import { CreateRoomModal } from '@/components/room/CreateRoomModal'
import type { RoomTemplate } from '@codraft/shared'

interface RoomSummary {
  id: string
  name: string
  fullSlug: string
  template: string
  isPublic: boolean
  updatedAt: string
  members: { userId: string; name: string; image?: string }[]
  sectionCount: number
  filledSectionCount: number
  lastMessage: { content: string; createdAt: string } | null
}

export function DashboardClient({
  rooms,
  username,
}: {
  rooms: RoomSummary[]
  username: string
}) {
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-fg">My Rooms</h1>
        <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
          + New Room
        </button>
      </div>

      {rooms.length === 0 ? (
        <div className="mt-16 flex flex-col items-center text-center">
          <div className="text-5xl">📄</div>
          <p className="mt-4 text-lg font-medium text-fg">No rooms yet</p>
          <button
            className="mt-4 text-sm font-medium text-accent hover:underline"
            onClick={() => setIsModalOpen(true)}
          >
            Create your first room →
          </button>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {rooms.map((room) => {
            const tpl = TEMPLATES[room.template as RoomTemplate] ?? TEMPLATES.custom
            return (
              <Link
                key={room.id}
                href={`/room/${room.id}`}
                className="card block p-5 transition hover:border-border-bright"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{tpl.icon}</span>
                    <span className="font-semibold text-fg">{room.name}</span>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      room.isPublic
                        ? 'bg-success/10 text-success'
                        : 'bg-bg-elevated text-fg-subtle'
                    }`}
                  >
                    {room.isPublic ? 'Public' : 'Private'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-fg-subtle">{room.fullSlug}</p>

                <div className="mt-3 flex -space-x-2">
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

                <p className="mt-3 text-xs text-fg-muted">
                  {room.filledSectionCount}/{room.sectionCount} sections filled
                </p>

                {room.lastMessage && (
                  <p className="mt-2 truncate text-xs text-fg-subtle">
                    {room.lastMessage.content} ·{' '}
                    {formatDistanceToNow(new Date(room.lastMessage.createdAt), { addSuffix: true })}
                  </p>
                )}
              </Link>
            )
          })}
        </div>
      )}

      <CreateRoomModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} username={username} />
    </div>
  )
}
