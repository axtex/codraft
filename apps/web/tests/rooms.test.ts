import { beforeEach, describe, expect, it, vi } from 'vitest'
import { jsonRequest, getRequest } from './request'

const session = { user: { id: 'user-1', username: 'ada', name: 'Ada' } }

const TRIP_SECTIONS = [
  'Overview',
  'Itinerary',
  'Hotels',
  'Budget',
  'Restaurants',
  'Packing List',
  'Notes',
]

const MEETING_SECTIONS = [
  'Agenda',
  'Attendees',
  'Discussion Points',
  'Decisions',
  'Action Items',
  'Next Steps',
]

const { auth, generateSectionContent, prisma } = vi.hoisted(() => ({
  auth: vi.fn(),
  generateSectionContent: vi.fn(),
  prisma: {
    room: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    section: {
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('@/auth', () => ({ auth }))
vi.mock('@/lib/prisma', () => ({ prisma }))
vi.mock('@/lib/ai-init', () => ({ generateSectionContent }))

import { POST } from '@/app/api/rooms/route'
import { GET } from '@/app/api/rooms/[id]/route'

type SectionCreate = { name: string; order: number; status: string }

function expectCreatedSections(roomName: string, names: string[]) {
  const created = prisma.section.create.mock.calls.map(
    (call) => (call[0] as { data: SectionCreate }).data
  )
  expect(created.map((row) => row.name)).toEqual(names)
  expect(created.map((row) => row.order)).toEqual(names.map((_, index) => index))
  expect(created.every((row) => row.status === 'empty')).toBe(true)

  const updates = prisma.section.update.mock.calls.map(
    (call) => (call[0] as { data: { content: string } }).data
  )
  expect(updates).toEqual(names.map((name) => ({ content: `Starter: ${name}` })))
  expect(generateSectionContent.mock.calls.map((call) => call[0])).toEqual(names.map(() => roomName))
  expect(generateSectionContent.mock.calls.map((call) => call[1])).toEqual(names)
}

beforeEach(() => {
  auth.mockReset()
  auth.mockResolvedValue(session)
  prisma.room.findUnique.mockReset()
  prisma.room.create.mockReset()
  prisma.section.create.mockReset()
  prisma.section.update.mockReset()
  generateSectionContent.mockReset()
  generateSectionContent.mockImplementation(async (_room: string, section: string) => `Starter: ${section}`)
  prisma.room.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
    id: 'room-1',
    ...args.data,
    inviteToken: 'invite-token',
  }))
  prisma.section.create.mockImplementation(async (args: { data: SectionCreate & { roomId: string } }) => ({
    id: `sec-${args.data.order}`,
    content: null,
    ...args.data,
  }))
  prisma.section.update.mockImplementation(
    async (args: { where: { id: string }; data: { content: string } }) => ({
      id: args.where.id,
      status: 'empty',
      ...args.data,
    })
  )
})

describe('POST /api/rooms', () => {
  it('rejects a signed-out caller with 401', async () => {
    auth.mockResolvedValue(null)

    const res = await POST(jsonRequest('http://localhost:3000/api/rooms', 'POST', { name: 'Lisbon', template: 'trip' }))

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
    expect(prisma.room.create).not.toHaveBeenCalled()
    expect(generateSectionContent).not.toHaveBeenCalled()
  })

  it('rejects a blank name with 400', async () => {
    const res = await POST(
      jsonRequest('http://localhost:3000/api/rooms', 'POST', { name: '   ', template: 'trip' })
    )

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Room name is required' })
    expect(prisma.room.create).not.toHaveBeenCalled()
    expect(generateSectionContent).not.toHaveBeenCalled()
  })

  it('creates the trip sections when that template is chosen', async () => {
    const res = await POST(
      jsonRequest('http://localhost:3000/api/rooms', 'POST', { name: 'Lisbon', template: 'trip' })
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      inviteUrl: 'http://localhost:3000/join/invite-token',
    })
    expect(prisma.room.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Lisbon',
        slug: 'lisbon',
        fullSlug: '@ada/lisbon',
        template: 'trip',
        linkSharingEnabled: true,
        ownerId: 'user-1',
        members: { create: { userId: 'user-1', role: 'OWNER' } },
      }),
    })
    expectCreatedSections('Lisbon', TRIP_SECTIONS)
  })

  it('infers meeting sections from the room name', async () => {
    const res = await POST(
      jsonRequest('http://localhost:3000/api/rooms', 'POST', { name: 'Monday standup' })
    )

    expect(res.status).toBe(200)
    expect(prisma.room.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Monday standup',
        slug: 'monday-standup',
        fullSlug: '@ada/monday-standup',
        template: 'meeting',
      }),
    })
    expectCreatedSections('Monday standup', MEETING_SECTIONS)
  })

  it('uses the explicit custom template even when the name looks like a trip', async () => {
    const res = await POST(
      jsonRequest('http://localhost:3000/api/rooms', 'POST', {
        name: 'Summer trip',
        template: 'custom',
        linkSharingEnabled: false,
      })
    )

    expect(res.status).toBe(200)
    expect(prisma.room.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Summer trip',
        template: 'custom',
        linkSharingEnabled: false,
      }),
    })
    expectCreatedSections('Summer trip', ['Overview', 'Notes'])
  })
})

describe('GET /api/rooms/:id', () => {
  it('returns 404 for an unknown room', async () => {
    prisma.room.findUnique.mockResolvedValue(null)

    const res = await GET(getRequest('http://localhost:3000/api/rooms/missing'), {
      params: { id: 'missing' },
    })

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Room not found' })
  })

  it('returns 401 when the caller is not a member', async () => {
    prisma.room.findUnique.mockResolvedValue({
      id: 'room-1',
      name: 'Lisbon',
      members: [{ userId: 'someone-else', role: 'OWNER' }],
      sections: [],
    })

    const res = await GET(getRequest('http://localhost:3000/api/rooms/room-1'), {
      params: { id: 'room-1' },
    })

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns the room to a member', async () => {
    const room = {
      id: 'room-1',
      name: 'Lisbon',
      members: [{ userId: 'user-1', role: 'OWNER' }],
      sections: [{ id: 'sec-0', name: 'Overview', order: 0 }],
    }
    prisma.room.findUnique.mockResolvedValue(room)

    const res = await GET(getRequest('http://localhost:3000/api/rooms/room-1'), {
      params: { id: 'room-1' },
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ room })
  })
})
