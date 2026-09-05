import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { saveSnapshot } from '@/lib/section-history'

async function requireEditor(roomId: string, userId: string) {
  const member = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
  })
  if (!member || (member.role !== 'OWNER' && member.role !== 'EDITOR')) {
    return null
  }
  return member
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; sectionId: string } }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const member = await requireEditor(params.id, session.user.id)
  if (!member) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body: unknown = await req.json()
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}

  if (record.direction === 'up' || record.direction === 'down') {
    const siblings = await prisma.section.findMany({
      where: { roomId: params.id },
      orderBy: { order: 'asc' },
    })
    const index = siblings.findIndex((s) => s.id === params.sectionId)
    if (index === -1) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 })
    }
    const swapIndex = record.direction === 'up' ? index - 1 : index + 1
    if (swapIndex < 0 || swapIndex >= siblings.length) {
      return NextResponse.json({ error: 'Cannot move further' }, { status: 400 })
    }

    const current = siblings[index]
    const neighbor = siblings[swapIndex]
    // Swap order values so the rest of the list stays put.
    await prisma.$transaction([
      prisma.section.update({ where: { id: current.id }, data: { order: neighbor.order } }),
      prisma.section.update({ where: { id: neighbor.id }, data: { order: current.order } }),
    ])

    const sections = await prisma.section.findMany({
      where: { roomId: params.id },
      orderBy: { order: 'asc' },
      select: { id: true, order: true },
    })
    return NextResponse.json({ sections })
  }

  const content = record.content
  if (typeof content !== 'string') {
    return NextResponse.json({ error: 'content is required' }, { status: 400 })
  }

  const existing = await prisma.section.findFirst({
    where: { id: params.sectionId, roomId: params.id },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Section not found' }, { status: 404 })
  }

  const section = await prisma.section.update({
    where: { id: params.sectionId },
    data: {
      content,
      status: 'human_edited',
      updatedBy: session.user.id,
    },
  })

  await saveSnapshot(params.sectionId, content, session.user.id, 'user_edit')

  return NextResponse.json({ section })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; sectionId: string } }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const member = await requireEditor(params.id, session.user.id)
  if (!member) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const existing = await prisma.section.findFirst({
    where: { id: params.sectionId, roomId: params.id },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Section not found' }, { status: 404 })
  }

  await prisma.section.delete({ where: { id: params.sectionId } })
  return NextResponse.json({ ok: true })
}
