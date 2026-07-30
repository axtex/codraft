import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; sectionId: string } }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const member = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId: params.id, userId: session.user.id } },
  })
  if (!member || (member.role !== 'OWNER' && member.role !== 'EDITOR')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await req.json()
  const content: string | undefined = body.content
  if (typeof content !== 'string') {
    return NextResponse.json({ error: 'content is required' }, { status: 400 })
  }

  const section = await prisma.section.update({
    where: { id: params.sectionId },
    data: {
      content,
      status: 'human_edited',
      updatedBy: session.user.id,
    },
  })

  return NextResponse.json({ section })
}
