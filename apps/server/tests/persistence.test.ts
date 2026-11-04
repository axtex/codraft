import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Server, Socket } from 'socket.io'
import * as Y from 'yjs'

const mocks = vi.hoisted(() => ({
  saveSectionState: vi.fn(),
  getChatHistory: vi.fn(),
  saveSnapshot: vi.fn(),
  publishSectionUpdate: vi.fn(),
  prisma: {
    section: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    sectionSnapshot: {
      findFirst: vi.fn(),
    },
  },
}))

vi.mock('../src/db-client', () => ({
  prisma: mocks.prisma,
  getChatHistory: mocks.getChatHistory,
  saveSnapshot: mocks.saveSnapshot,
  saveSectionState: mocks.saveSectionState,
}))

vi.mock('../src/redis-sync', () => ({
  publishSectionUpdate: mocks.publishSectionUpdate,
}))

vi.mock('../src/ai-handler', () => ({
  handleMessage: vi.fn(),
  handleFillSection: vi.fn(),
}))

import { saveSectionState, saveSnapshot, prisma } from '../src/db-client'
import { roomManager } from '../src/room-state'
import { registerSocketHandlers } from '../src/socket-handlers'

type Handler = (...args: unknown[]) => unknown

let connectClient: (socket: Socket) => void = () => {
  throw new Error('socket connection handler was not registered')
}

const emit = vi.fn()
const to = vi.fn(() => ({ emit }))
const io = {
  on(event: string, callback: (socket: Socket) => void) {
    if (event === 'connection') connectClient = callback
  },
  to,
}

registerSocketHandlers(io as unknown as Server)

function openClient(id: string) {
  const handlers = new Map<string, Handler>()
  const socket = {
    id,
    on(event: string, callback: Handler) {
      handlers.set(event, callback)
    },
    join: vi.fn(),
    emit: vi.fn(),
    to() {
      return { emit: vi.fn() }
    },
  }
  connectClient(socket as unknown as Socket)
  return handlers
}

function must(handlers: Map<string, Handler>, event: string): Handler {
  const handler = handlers.get(event)
  if (!handler) throw new Error(`socket did not register ${event}`)
  return handler
}

function recordedUpdates(write: (text: Y.XmlText) => void): Uint8Array[] {
  const doc = new Y.Doc()
  const updates: Uint8Array[] = []
  doc.on('update', (update: Uint8Array) => {
    updates.push(update)
  })
  const text = new Y.XmlText()
  doc.getXmlFragment('default').insert(0, [text])
  write(text)
  return updates
}

function seedSection(sectionId: string, value: string): string {
  const ydoc = roomManager.getSectionDoc('room-edits', sectionId)
  const frag = ydoc.getXmlFragment('default')
  if (frag.length > 0) frag.delete(0, frag.length)
  const node = new Y.XmlText()
  frag.insert(0, [node])
  node.insert(0, value)
  return roomManager.getSectionText('room-edits', sectionId)
}

const editors = openClient('sock-editor')

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation((message: unknown, error?: unknown) => {
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error ?? '')
    throw new Error(`unexpected console.error: ${String(message)} ${detail}`)
  })
  mocks.saveSectionState.mockReset()
  mocks.saveSectionState.mockResolvedValue(undefined)
  mocks.getChatHistory.mockReset()
  mocks.getChatHistory.mockResolvedValue([])
  mocks.saveSnapshot.mockReset()
  mocks.saveSnapshot.mockResolvedValue(undefined)
  mocks.publishSectionUpdate.mockReset()
  mocks.publishSectionUpdate.mockResolvedValue(undefined)
  mocks.prisma.section.findMany.mockReset()
  mocks.prisma.section.findMany.mockResolvedValue([])
  mocks.prisma.section.update.mockReset()
  mocks.prisma.section.update.mockResolvedValue({})
  mocks.prisma.sectionSnapshot.findFirst.mockReset()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  errorSpy.mockRestore()
})

describe('yjs save debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  it('coalesces edits inside the 5s window into one write of the latest text', async () => {
    const sectionId = 'sec-coalesce'
    const ydoc = roomManager.getSectionDoc('room-coalesce', sectionId)
    const text = new Y.XmlText()
    ydoc.getXmlFragment('default').insert(0, [text])
    text.insert(0, 'one')

    roomManager.scheduleSectionSave('room-coalesce', sectionId, ydoc)
    await vi.advanceTimersByTimeAsync(2_000)
    text.insert(3, ' two')
    roomManager.scheduleSectionSave('room-coalesce', sectionId, ydoc)
    await vi.advanceTimersByTimeAsync(2_000)
    text.insert(7, ' three')
    roomManager.scheduleSectionSave('room-coalesce', sectionId, ydoc)

    expect(saveSectionState).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(4_999)
    expect(saveSectionState).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    expect(saveSectionState).toHaveBeenCalledTimes(1)
    expect(saveSectionState).toHaveBeenCalledWith(sectionId, ydoc, 'one two three')
  })

  it('flushes the pending save when the last client disconnects and does not write again', async () => {
    const roomId = 'room-flush'
    const sectionId = 'sec-flush'
    const handlers = openClient('sock-a')
    await must(handlers, 'join-room')(roomId, 'user-a', 'Ada')

    const updates = recordedUpdates((text) => {
      text.insert(0, 'hello')
      text.insert(5, ' world')
    })
    for (const update of updates) {
      must(handlers, 'yjs-update')(roomId, sectionId, Array.from(update))
    }

    expect(saveSectionState).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(saveSectionState).not.toHaveBeenCalled()

    must(handlers, 'disconnect')()

    expect(saveSectionState).toHaveBeenCalledTimes(1)
    expect(saveSectionState.mock.calls[0]?.[0]).toBe(sectionId)
    expect(saveSectionState.mock.calls[0]?.[2]).toBe('hello world')

    await vi.advanceTimersByTimeAsync(10_000)
    expect(saveSectionState).toHaveBeenCalledTimes(1)
  })

  it('keeps the pending save while another client is connected, then writes once', async () => {
    const roomId = 'room-stay'
    const sectionId = 'sec-stay'
    const ada = openClient('sock-ada')
    const bea = openClient('sock-bea')
    await must(ada, 'join-room')(roomId, 'user-a', 'Ada')
    await must(bea, 'join-room')(roomId, 'user-b', 'Bea')

    const updates = recordedUpdates((text) => {
      text.insert(0, 'still here')
    })
    for (const update of updates) {
      must(ada, 'yjs-update')(roomId, sectionId, Array.from(update))
    }

    await vi.advanceTimersByTimeAsync(1_000)
    must(ada, 'disconnect')()
    expect(saveSectionState).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(3_999)
    expect(saveSectionState).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    expect(saveSectionState).toHaveBeenCalledTimes(1)
    expect(saveSectionState.mock.calls[0]?.[2]).toBe('still here')
  })
})

describe('section edit snapshots', () => {
  it('skips a snapshot when the latest user_edit already has this text', async () => {
    const text = seedSection('sec-skip', 'Lisbon on day one')
    expect(text).toBe('Lisbon on day one')
    prisma.sectionSnapshot.findFirst.mockResolvedValue({ content: text, reason: 'user_edit' })

    await must(editors, 'section-human-edit')('room-edits', 'sec-skip', 'user-1')

    expect(saveSnapshot).not.toHaveBeenCalled()
    expect(prisma.sectionSnapshot.findFirst).toHaveBeenCalledWith({
      where: { sectionId: 'sec-skip' },
      orderBy: { createdAt: 'desc' },
      select: { content: true, reason: true },
    })
    expect(prisma.section.update).toHaveBeenCalledWith({
      where: { id: 'sec-skip' },
      data: { status: 'human_edited', updatedBy: 'user-1', content: text },
    })
    expect(emit).toHaveBeenCalledWith('section-status-update', {
      sectionId: 'sec-skip',
      status: 'human_edited',
    })
  })

  it('records a snapshot when the section text changed', async () => {
    const text = seedSection('sec-change', 'Lisbon on day two')
    prisma.sectionSnapshot.findFirst.mockResolvedValue({
      content: 'Lisbon on day one',
      reason: 'user_edit',
    })

    await must(editors, 'section-human-edit')('room-edits', 'sec-change', 'user-1')

    expect(saveSnapshot).toHaveBeenCalledTimes(1)
    expect(saveSnapshot).toHaveBeenCalledWith('sec-change', text, 'user-1', 'user_edit')
  })

  it('still records a snapshot when the same text was stored for a different reason', async () => {
    const text = seedSection('sec-fill', 'Packed list')
    prisma.sectionSnapshot.findFirst.mockResolvedValue({ content: text, reason: 'claude_fill' })

    await must(editors, 'section-human-edit')('room-edits', 'sec-fill', 'user-9')

    expect(saveSnapshot).toHaveBeenCalledWith('sec-fill', text, 'user-9', 'user_edit')
  })
})
