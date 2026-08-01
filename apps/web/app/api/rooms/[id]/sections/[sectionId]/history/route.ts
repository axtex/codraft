import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { getSnapshots } from '@/lib/section-history'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; sectionId: string } }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const member = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId: params.id, userId: session.user.id } },
  })
  if (!member) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const section = await prisma.section.findFirst({
    where: { id: params.sectionId, roomId: params.id },
  })
  if (!section) {
    return NextResponse.json({ error: 'Section not found' }, { status: 404 })
  }

  const snapshots = await getSnapshots(params.sectionId)

  return NextResponse.json({
    snapshots: snapshots.map((s) => ({
      id: s.id,
      savedBy: s.savedBy,
      reason: s.reason,
      createdAt: s.createdAt,
      contentPreview: s.content.slice(0, 150),
      content: s.content,
    })),
  })
}
