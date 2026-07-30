import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()

  const room = await prisma.room.findUnique({
    where: { id: params.id },
    include: {
      members: { include: { user: true } },
      sections: { orderBy: { order: 'asc' } },
    },
  })

  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  }

  const isMember = session?.user?.id
    ? room.members.some((m) => m.userId === session.user.id)
    : false

  if (!room.isPublic && !isMember) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json({ room })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const room = await prisma.room.findUnique({ where: { id: params.id } })
  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  }
  if (room.ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Only the owner can update this room' }, { status: 403 })
  }

  const body = await req.json()
  const data: { name?: string; isPublic?: boolean } = {}
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name
  if (typeof body.isPublic === 'boolean') data.isPublic = body.isPublic

  const updated = await prisma.room.update({ where: { id: params.id }, data })
  return NextResponse.json({ room: updated })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const room = await prisma.room.findUnique({ where: { id: params.id } })
  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  }
  if (room.ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Only the owner can delete this room' }, { status: 403 })
  }

  // Members, sections, messages, and suggestions all cascade via the
  // Prisma schema's onDelete: Cascade relations.
  await prisma.room.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
