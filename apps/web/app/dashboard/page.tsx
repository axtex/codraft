import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { DashboardClient } from './dashboard-client'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) return null

  const rooms = await prisma.room.findMany({
    where: {
      OR: [
        { ownerId: session.user.id },
        { members: { some: { userId: session.user.id } } },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      members: { include: { user: true } },
      sections: { select: { status: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })

  const serialized = rooms.map((room) => ({
    id: room.id,
    name: room.name,
    fullSlug: room.fullSlug,
    template: room.template,
    linkSharingEnabled: room.linkSharingEnabled,
    updatedAt: room.updatedAt.toISOString(),
    members: room.members.map((m) => ({
      userId: m.userId,
      name: m.user.name ?? m.user.username ?? 'Member',
      image: m.user.image ?? undefined,
    })),
    sectionCount: room.sections.length,
    filledSectionCount: room.sections.filter(
      (s) => s.status === 'filled' || s.status === 'human_edited'
    ).length,
    lastMessage: room.messages[0]
      ? { content: room.messages[0].content, createdAt: room.messages[0].createdAt.toISOString() }
      : null,
  }))

  return (
    <DashboardClient
      rooms={serialized}
      username={session.user.username ?? session.user.id ?? 'user'}
    />
  )
}
