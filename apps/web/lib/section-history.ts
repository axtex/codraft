import { prisma } from '@/lib/prisma'

export async function saveSnapshot(
  sectionId: string,
  content: string,
  savedBy: string,
  reason: string
): Promise<void> {
  // Don't save if content is empty
  if (!content?.trim()) return

  await prisma.sectionSnapshot.create({
    data: { sectionId, content, savedBy, reason },
  })

  // Keep max 20 snapshots per section — delete oldest beyond 20
  const snapshots = await prisma.sectionSnapshot.findMany({
    where: { sectionId },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })

  if (snapshots.length > 20) {
    const toDelete = snapshots.slice(20).map((s) => s.id)
    await prisma.sectionSnapshot.deleteMany({
      where: { id: { in: toDelete } },
    })
  }
}

export async function getSnapshots(sectionId: string) {
  return prisma.sectionSnapshot.findMany({
    where: { sectionId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
}
