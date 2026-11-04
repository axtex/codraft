import { beforeEach, describe, expect, it, vi } from 'vitest'
import { jsonRequest } from './request'

const session = { user: { id: 'user-1', username: 'ada', name: 'Ada' } }

const { auth, notifySectionUpdated, prisma } = vi.hoisted(() => ({
  auth: vi.fn(),
  notifySectionUpdated: vi.fn(),
  prisma: {
    roomMember: { findUnique: vi.fn() },
    section: { findFirst: vi.fn(), update: vi.fn() },
    sectionSnapshot: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
  },
}))

vi.mock('@/auth', () => ({ auth }))
vi.mock('@/lib/prisma', () => ({ prisma }))
vi.mock('@/lib/ws-internal', () => ({ notifySectionUpdated }))

import { POST } from '@/app/api/rooms/[id]/sections/[sectionId]/history/revert/route'

const params = { id: 'room-1', sectionId: 'sec-1' }

function revert(body: unknown) {
  return POST(
    jsonRequest('http://localhost:3000/api/rooms/room-1/sections/sec-1/history/revert', 'POST', body),
    { params }
  )
}

beforeEach(() => {
  auth.mockReset()
  auth.mockResolvedValue(session)
  notifySectionUpdated.mockReset()
  notifySectionUpdated.mockResolvedValue(undefined)
  prisma.roomMember.findUnique.mockReset()
  prisma.roomMember.findUnique.mockResolvedValue({ role: 'EDITOR', userId: 'user-1' })
  prisma.section.findFirst.mockReset()
  prisma.section.update.mockReset()
  prisma.sectionSnapshot.findFirst.mockReset()
  prisma.sectionSnapshot.create.mockReset()
  prisma.sectionSnapshot.findMany.mockReset()
  prisma.sectionSnapshot.deleteMany.mockReset()
})

describe('POST /api/rooms/:id/sections/:sectionId/history/revert', () => {
  it('rejects a request without snapshotId', async () => {
    const res = await revert({})

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'snapshotId is required' })
    expect(prisma.sectionSnapshot.findFirst).not.toHaveBeenCalled()
    expect(prisma.section.update).not.toHaveBeenCalled()
    expect(notifySectionUpdated).not.toHaveBeenCalled()
  })

  it('returns 404 when the snapshot is not on this section', async () => {
    prisma.sectionSnapshot.findFirst.mockResolvedValue(null)

    const res = await revert({ snapshotId: 'snap-missing' })

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Snapshot not found' })
    expect(prisma.sectionSnapshot.findFirst).toHaveBeenCalledWith({
      where: { id: 'snap-missing', sectionId: 'sec-1' },
    })
    expect(prisma.section.update).not.toHaveBeenCalled()
    expect(prisma.sectionSnapshot.create).not.toHaveBeenCalled()
    expect(notifySectionUpdated).not.toHaveBeenCalled()
  })

  it('restores the snapshot, records a revert, and notifies live clients', async () => {
    prisma.sectionSnapshot.findFirst.mockResolvedValue({
      id: 'snap-9',
      sectionId: 'sec-1',
      content: 'Day 1 in Lisbon',
      savedBy: 'user-2',
      reason: 'user_edit',
    })
    prisma.section.findFirst.mockResolvedValue({ id: 'sec-1', roomId: 'room-1', content: 'later draft' })
    prisma.section.update.mockResolvedValue({
      id: 'sec-1',
      content: 'Day 1 in Lisbon',
      status: 'human_edited',
    })
    prisma.sectionSnapshot.create.mockResolvedValue({ id: 'snap-10' })
    prisma.sectionSnapshot.findMany.mockResolvedValue([{ id: 'snap-10' }])

    const res = await revert({ snapshotId: 'snap-9' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      section: { id: 'sec-1', content: 'Day 1 in Lisbon', status: 'human_edited' },
    })
    expect(prisma.section.update).toHaveBeenCalledWith({
      where: { id: 'sec-1' },
      data: {
        content: 'Day 1 in Lisbon',
        status: 'human_edited',
        updatedBy: 'user-1',
      },
    })
    expect(prisma.sectionSnapshot.create).toHaveBeenCalledWith({
      data: {
        sectionId: 'sec-1',
        content: 'Day 1 in Lisbon',
        savedBy: 'user-1',
        reason: 'revert',
      },
    })
    expect(notifySectionUpdated).toHaveBeenCalledWith({
      roomId: 'room-1',
      sectionId: 'sec-1',
      content: 'Day 1 in Lisbon',
    })
    expect(prisma.sectionSnapshot.deleteMany).not.toHaveBeenCalled()
  })
})
