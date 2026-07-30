import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const suggestionId: string | undefined = body.suggestionId
  if (!suggestionId) {
    return NextResponse.json({ error: 'suggestionId is required' }, { status: 400 })
  }

  const suggestion = await prisma.extractionSuggestion.findUnique({
    where: { id: suggestionId },
    include: { section: true },
  })
  if (!suggestion || suggestion.section.roomId !== params.id) {
    return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 })
  }

  const [section] = await prisma.$transaction([
    prisma.section.update({
      where: { id: suggestion.sectionId },
      data: { content: suggestion.content, status: 'filled', updatedBy: 'claude' },
    }),
    prisma.extractionSuggestion.update({
      where: { id: suggestionId },
      data: { status: 'accepted' },
    }),
  ])

  // Broadcasting `section-updated` over the socket connection is the
  // caller's responsibility — this route only performs the DB write.
  return NextResponse.json({ section })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const suggestionId: string | undefined = body.suggestionId
  if (!suggestionId) {
    return NextResponse.json({ error: 'suggestionId is required' }, { status: 400 })
  }

  await prisma.extractionSuggestion.update({
    where: { id: suggestionId },
    data: { status: 'rejected' },
  })

  return NextResponse.json({ success: true })
}
