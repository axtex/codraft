import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getRequest } from './request'

const session = { user: { id: 'user-1', username: 'ada', name: 'Ada' } }

const { auth, prisma } = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: {
    room: { findUnique: vi.fn() },
    roomMember: { findUnique: vi.fn(), create: vi.fn() },
  },
}))

vi.mock('@/auth', () => ({ auth }))
vi.mock('@/lib/prisma', () => ({ prisma }))

import { GET } from '@/app/api/join/[token]/route'

beforeEach(() => {
  auth.mockReset()
  prisma.room.findUnique.mockReset()
  prisma.roomMember.findUnique.mockReset()
  prisma.roomMember.create.mockReset()
})

describe('GET /api/join/:token', () => {
  it('returns 404 for an unknown invite token', async () => {
    auth.mockResolvedValue(session)
    prisma.room.findUnique.mockResolvedValue(null)

    const res = await GET(getRequest('http://localhost:3000/api/join/missing-token'), {
      params: { token: 'missing-token' },
    })

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Invite link is invalid' })
    expect(prisma.roomMember.create).not.toHaveBeenCalled()
  })

  it('returns 401 when the token is valid but the caller is signed out', async () => {
    auth.mockResolvedValue(null)
    prisma.room.findUnique.mockResolvedValue({ id: 'room-1', linkSharingEnabled: true })

    const res = await GET(getRequest('http://localhost:3000/api/join/invite-token'), {
      params: { token: 'invite-token' },
    })

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ requiresAuth: true })
    expect(prisma.roomMember.create).not.toHaveBeenCalled()
  })

  it('adds a new joiner as EDITOR and returns the room id', async () => {
    auth.mockResolvedValue(session)
    prisma.room.findUnique.mockResolvedValue({ id: 'room-1', linkSharingEnabled: true })
    prisma.roomMember.findUnique.mockResolvedValue(null)
    prisma.roomMember.create.mockResolvedValue({ id: 'member-1', role: 'EDITOR' })

    const res = await GET(getRequest('http://localhost:3000/api/join/invite-token'), {
      params: { token: 'invite-token' },
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ roomId: 'room-1' })
    expect(prisma.room.findUnique).toHaveBeenCalledWith({ where: { inviteToken: 'invite-token' } })
    expect(prisma.roomMember.create).toHaveBeenCalledWith({
      data: { roomId: 'room-1', userId: 'user-1', role: 'EDITOR' },
    })
  })

  it('rejects a new joiner when link sharing is off', async () => {
    auth.mockResolvedValue(session)
    prisma.room.findUnique.mockResolvedValue({ id: 'room-1', linkSharingEnabled: false })
    prisma.roomMember.findUnique.mockResolvedValue(null)

    const res = await GET(getRequest('http://localhost:3000/api/join/invite-token'), {
      params: { token: 'invite-token' },
    })

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({
      error: 'This room is invite only — ask the owner to add you',
    })
    expect(prisma.roomMember.create).not.toHaveBeenCalled()
  })

  it('lets an existing owner re-enter an invite-only room without a new membership', async () => {
    auth.mockResolvedValue(session)
    prisma.room.findUnique.mockResolvedValue({ id: 'room-1', linkSharingEnabled: false })
    prisma.roomMember.findUnique.mockResolvedValue({ role: 'OWNER', userId: 'user-1' })

    const res = await GET(getRequest('http://localhost:3000/api/join/invite-token'), {
      params: { token: 'invite-token' },
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ roomId: 'room-1' })
    expect(prisma.roomMember.create).not.toHaveBeenCalled()
  })
})
