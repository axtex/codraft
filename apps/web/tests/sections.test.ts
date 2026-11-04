import { beforeEach, describe, expect, it, vi } from 'vitest'
import { jsonRequest } from './request'

const session = { user: { id: 'user-1', username: 'ada', name: 'Ada' } }

const { auth, prisma } = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: {
    roomMember: { findUnique: vi.fn() },
    section: { findFirst: vi.fn(), update: vi.fn() },
    sectionSnapshot: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
  },
}))

vi.mock('@/auth', () => ({ auth }))
vi.mock('@/lib/prisma', () => ({ prisma }))

import { PATCH } from '@/app/api/rooms/[id]/sections/[sectionId]/route'

const params = { id: 'room-1', sectionId: 'sec-1' }

function patch(body: unknown) {
  return PATCH(jsonRequest('http://localhost:3000/api/rooms/room-1/sections/sec-1', 'PATCH', body), {
    params,
  })
}

beforeEach(() => {
  auth.mockReset()
  auth.mockResolvedValue(session)
  prisma.roomMember.findUnique.mockReset()
  prisma.roomMember.findUnique.mockResolvedValue({ role: 'EDITOR', userId: 'user-1' })
  prisma.section.findFirst.mockReset()
  prisma.section.update.mockReset()
  prisma.sectionSnapshot.create.mockReset()
  prisma.sectionSnapshot.findMany.mockReset()
  prisma.sectionSnapshot.deleteMany.mockReset()
})

describe('PATCH /api/rooms/:id/sections/:sectionId', () => {
  it('rejects a signed-out caller with 401', async () => {
    auth.mockResolvedValue(null)

    const res = await patch({ content: 'Day 2: Sintra' })

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
    expect(prisma.roomMember.findUnique).not.toHaveBeenCalled()
    expect(prisma.section.update).not.toHaveBeenCalled()
  })

  it('rejects a body without content', async () => {
    const res = await patch({})

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'content is required' })
    expect(prisma.section.findFirst).not.toHaveBeenCalled()
    expect(prisma.section.update).not.toHaveBeenCalled()
  })

  it('returns 404 when the section is not in the room', async () => {
    prisma.section.findFirst.mockResolvedValue(null)

    const res = await patch({ content: 'Day 2: Sintra' })

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Section not found' })
    expect(prisma.section.update).not.toHaveBeenCalled()
    expect(prisma.sectionSnapshot.create).not.toHaveBeenCalled()
  })

  it('marks the section human-edited and stores a user_edit snapshot', async () => {
    prisma.section.findFirst.mockResolvedValue({ id: 'sec-1', roomId: 'room-1', content: 'old' })
    prisma.section.update.mockResolvedValue({
      id: 'sec-1',
      content: 'Day 2: Sintra',
      status: 'human_edited',
    })
    prisma.sectionSnapshot.create.mockResolvedValue({ id: 'snap-1' })
    prisma.sectionSnapshot.findMany.mockResolvedValue([{ id: 'snap-1' }])

    const res = await patch({ content: 'Day 2: Sintra' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      section: { id: 'sec-1', content: 'Day 2: Sintra', status: 'human_edited' },
    })
    expect(prisma.section.findFirst).toHaveBeenCalledWith({
      where: { id: 'sec-1', roomId: 'room-1' },
    })
    expect(prisma.section.update).toHaveBeenCalledWith({
      where: { id: 'sec-1' },
      data: {
        content: 'Day 2: Sintra',
        status: 'human_edited',
        updatedBy: 'user-1',
      },
    })
    expect(prisma.sectionSnapshot.create).toHaveBeenCalledWith({
      data: {
        sectionId: 'sec-1',
        content: 'Day 2: Sintra',
        savedBy: 'user-1',
        reason: 'user_edit',
      },
    })
    expect(prisma.sectionSnapshot.deleteMany).not.toHaveBeenCalled()
  })
})
