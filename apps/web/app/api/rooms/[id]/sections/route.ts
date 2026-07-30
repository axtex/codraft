import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { generateSectionContent } from '@/lib/ai-init'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const room = await prisma.room.findUnique({
    where: { id: params.id },
    include: { members: true },
  })
  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  }

  const member = room.members.find((m) => m.userId === session.user.id)
  if (!member || (member.role !== 'OWNER' && member.role !== 'EDITOR')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await req.json()
  const name: string | undefined = body.name
  if (!name || !name.trim()) {
    return NextResponse.json({ error: 'Section name is required' }, { status: 400 })
  }

  const maxOrder = await prisma.section.aggregate({
    where: { roomId: room.id },
    _max: { order: true },
  })

  const section = await prisma.section.create({
    data: {
      roomId: room.id,
      name,
      order: (maxOrder._max.order ?? -1) + 1,
      status: 'empty',
      addedBy: session.user.id,
    },
  })

  const content = await generateSectionContent(room.name, name)
  const filled = await prisma.section.update({
    where: { id: section.id },
    data: { content, status: 'filled' },
  })

  // The caller (client) is responsible for emitting `add-section` over the
  // socket connection — this route only performs the DB write.
  return NextResponse.json({ section: filled })
}
