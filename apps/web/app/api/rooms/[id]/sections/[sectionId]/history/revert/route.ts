import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { saveSnapshot } from '@/lib/section-history'

export async function POST(
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
  const snapshotId: string | undefined = body.snapshotId
  if (!snapshotId) {
    return NextResponse.json({ error: 'snapshotId is required' }, { status: 400 })
  }

  const snapshot = await prisma.sectionSnapshot.findFirst({
    where: { id: snapshotId, sectionId: params.sectionId },
  })
  if (!snapshot) {
    return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 })
  }

  const section = await prisma.section.findFirst({
    where: { id: params.sectionId, roomId: params.id },
  })
  if (!section) {
    return NextResponse.json({ error: 'Section not found' }, { status: 404 })
  }

  const updated = await prisma.section.update({
    where: { id: params.sectionId },
    data: {
      content: snapshot.content,
      status: 'human_edited',
      updatedBy: session.user.id,
    },
  })

  await saveSnapshot(params.sectionId, snapshot.content, session.user.id, 'revert')

  return NextResponse.json({ section: updated })
}
