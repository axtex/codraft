import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const room = await prisma.room.findUnique({ where: { inviteToken: params.token } })
  if (!room) {
    return NextResponse.json({ error: 'Invite link is invalid' }, { status: 404 })
  }

  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ requiresAuth: true }, { status: 401 })
  }

  const existing = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId: room.id, userId: session.user.id } },
  })

  // Never downgrade an existing OWNER/EDITOR to a plain join — only add a
  // membership row when the user isn't already a member.
  if (!existing) {
    await prisma.roomMember.create({
      data: { roomId: room.id, userId: session.user.id, role: 'EDITOR' },
    })
  }

  return NextResponse.json({ roomId: room.id })
}
