import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { detectTemplate, TEMPLATES } from '@/lib/templates'
import { generateSectionContent } from '@/lib/ai-init'
import {
  generateSlug,
  generateFullSlug,
  generateInviteUrl,
  handleDuplicateSlug,
} from '@/lib/room-utils'
import type { RoomTemplate } from '@codraft/shared'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const name: string | undefined = body.name
  // Default on — "anyone with link" matches Google Docs–style sharing.
  const linkSharingEnabled: boolean =
    typeof body.linkSharingEnabled === 'boolean' ? body.linkSharingEnabled : true
  if (!name || !name.trim()) {
    return NextResponse.json({ error: 'Room name is required' }, { status: 400 })
  }

  const template: RoomTemplate = body.template ?? detectTemplate(name)
  const slug = generateSlug(name)
  const username = session.user.username ?? session.user.id
  const fullSlug = await handleDuplicateSlug(generateFullSlug(username, slug), prisma)

  const room = await prisma.room.create({
    data: {
      name,
      slug,
      fullSlug,
      template,
      linkSharingEnabled,
      ownerId: session.user.id,
      members: {
        create: { userId: session.user.id, role: 'OWNER' },
      },
    },
  })

  const sectionNames = TEMPLATES[template].sections
  const createdSections = await Promise.all(
    sectionNames.map((sectionName, index) =>
      prisma.section.create({
        data: {
          roomId: room.id,
          name: sectionName,
          order: index,
          status: 'empty',
        },
      })
    )
  )

  // Starter content is generated for every section in parallel — each call
  // is independent, so there's no reason to serialize them.
  const contents = await Promise.all(
    createdSections.map((section) => generateSectionContent(room.name, section.name))
  )

  // Starter scaffolding helps the team begin, but it is not a completed
  // section — keep status `empty` so "Filled ✓" only appears after an
  // explicit Claude fill (or human edit path).
  const seededSections = await Promise.all(
    createdSections.map((section, index) =>
      prisma.section.update({
        where: { id: section.id },
        data: { content: contents[index] },
      })
    )
  )

  return NextResponse.json({
    room,
    inviteUrl: generateInviteUrl(room.inviteToken),
    sections: seededSections,
  })
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rooms = await prisma.room.findMany({
    where: {
      OR: [{ ownerId: session.user.id }, { members: { some: { userId: session.user.id } } }],
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      members: true,
      sections: { select: { status: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })

  const result = rooms.map((room) => {
    const filledCount = room.sections.filter(
      (s) => s.status === 'filled' || s.status === 'human_edited'
    ).length
    return {
      id: room.id,
      name: room.name,
      slug: room.slug,
      fullSlug: room.fullSlug,
      template: room.template,
      linkSharingEnabled: room.linkSharingEnabled,
      updatedAt: room.updatedAt,
      memberCount: room.members.length,
      sectionCount: room.sections.length,
      filledSectionCount: filledCount,
      lastMessage: room.messages[0] ?? null,
    }
  })

  return NextResponse.json({ rooms: result })
}
