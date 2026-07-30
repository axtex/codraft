import { notFound } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { RoomWorkspace } from './room-workspace'
import type { MessageType, SectionStatus } from '@codraft/shared'
import type { RoomMemberInfo } from '@codraft/shared'

export default async function RoomPage({ params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user?.id) return null

  const room = await prisma.room.findUnique({
    where: { id: params.id },
    include: {
      members: { include: { user: true } },
      sections: { orderBy: { order: 'asc' } },
      messages: { orderBy: { createdAt: 'asc' }, take: 50 },
    },
  })

  if (!room) notFound()

  const isMember = room.members.some((m) => m.userId === session.user.id)
  if (!room.isPublic && !isMember) notFound()

  return (
    <RoomWorkspace
      room={{
        id: room.id,
        name: room.name,
        fullSlug: room.fullSlug,
        isPublic: room.isPublic,
        ownerId: room.ownerId,
        inviteToken: room.inviteToken,
      }}
      members={room.members.map(
        (m): RoomMemberInfo => ({
          userId: m.userId,
          name: m.user.name ?? m.user.username ?? 'Member',
          image: m.user.image ?? undefined,
          role: m.role as RoomMemberInfo['role'],
          isOnline: false,
          cursorColor: '#6366f1',
        })
      )}
      sections={room.sections.map((s) => ({
        id: s.id,
        roomId: s.roomId,
        name: s.name,
        order: s.order,
        status: s.status as SectionStatus,
        content: s.content ?? '',
        addedBy: s.addedBy,
        updatedAt: s.updatedAt.toISOString(),
        updatedBy: s.updatedBy,
        yjsState: s.yjsState ? Array.from(s.yjsState) : undefined,
      }))}
      messages={room.messages.map((m) => ({
        id: m.id,
        roomId: m.roomId,
        userId: m.userId,
        userName: m.userName,
        userImage: m.userImage ?? undefined,
        content: m.content,
        type: m.type as MessageType,
        createdAt: m.createdAt.toISOString(),
      }))}
      currentUser={{
        id: session.user.id,
        name: session.user.name ?? session.user.username ?? 'You',
        image: session.user.image ?? undefined,
      }}
    />
  )
}
