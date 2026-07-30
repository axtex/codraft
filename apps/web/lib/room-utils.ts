import slugify from 'slugify'
import type { PrismaClient } from '@prisma/client'

export function generateSlug(name: string): string {
  return slugify(name, { lower: true, strict: true })
}

export function generateFullSlug(username: string, slug: string): string {
  return `@${username}/${slug}`
}

export function generateInviteUrl(token: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL}/join/${token}`
}

export async function handleDuplicateSlug(
  fullSlug: string,
  prisma: PrismaClient
): Promise<string> {
  const existing = await prisma.room.findUnique({ where: { fullSlug } })
  if (!existing) return fullSlug

  let attempt = 2
  while (true) {
    const candidate = `${fullSlug}-${attempt}`
    const clash = await prisma.room.findUnique({ where: { fullSlug: candidate } })
    if (!clash) return candidate
    attempt++
  }
}
