import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = {
  id: string
  sectionId: string
  content: string
  savedBy: string
  reason: string
  createdAt: Date
}

const mem = vi.hoisted(() => {
  const rows: Row[] = []
  let seq = 0
  const api = {
    async create({
      data,
    }: {
      data: { sectionId: string; content: string; savedBy: string; reason: string }
    }) {
      seq += 1
      const row: Row = {
        id: `snap-${seq}`,
        sectionId: data.sectionId,
        content: data.content,
        savedBy: data.savedBy,
        reason: data.reason,
        createdAt: new Date(seq * 1000),
      }
      rows.push(row)
      return row
    },
    async findMany(args: {
      where: { sectionId: string }
      orderBy?: { createdAt?: 'asc' | 'desc' }
      select?: { id?: boolean }
    }) {
      let list = rows.filter((row) => row.sectionId === args.where.sectionId)
      if (args.orderBy?.createdAt === 'desc') {
        list = [...list].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      }
      if (args.select?.id) return list.map((row) => ({ id: row.id }))
      return list
    },
    async deleteMany({ where }: { where: { id: { in: string[] } } }) {
      const drop = new Set(where.id.in)
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        if (drop.has(rows[i].id)) rows.splice(i, 1)
      }
      return { count: drop.size }
    },
  }
  return {
    rows,
    reset() {
      rows.splice(0, rows.length)
      seq = 0
    },
    api,
  }
})

vi.mock('@/lib/prisma', () => ({
  prisma: { sectionSnapshot: mem.api },
}))

import { saveSnapshot } from '@/lib/section-history'

beforeEach(() => {
  mem.reset()
})

describe('saveSnapshot', () => {
  it('does not store blank content', async () => {
    await saveSnapshot('sec-1', '', 'user-1', 'user_edit')
    await saveSnapshot('sec-1', '   ', 'user-1', 'user_edit')
    await saveSnapshot('sec-1', '\n\n', 'user-1', 'user_edit')

    expect(mem.rows).toHaveLength(0)
  })

  it('keeps the newest 20 snapshots for that section only', async () => {
    for (let i = 1; i <= 20; i += 1) {
      await saveSnapshot('sec-a', `v${i}`, 'user-1', 'user_edit')
    }
    expect(mem.rows.map((row) => row.content)).toEqual(
      Array.from({ length: 20 }, (_, i) => `v${i + 1}`)
    )

    await saveSnapshot('sec-b', 'keep me', 'user-1', 'user_edit')
    await saveSnapshot('sec-a', 'v21', 'user-1', 'user_edit')

    expect(mem.rows.filter((row) => row.sectionId === 'sec-a').map((row) => row.content)).toEqual(
      Array.from({ length: 20 }, (_, i) => `v${i + 2}`)
    )
    expect(mem.rows.filter((row) => row.sectionId === 'sec-b').map((row) => row.content)).toEqual([
      'keep me',
    ])
  })
})
