'use client'

import { useEffect, useState } from 'react'
import type { Socket } from 'socket.io-client'
import * as Y from 'yjs'

// Sentinel transaction origin used to mark updates applied from the network,
// so the local 'update' listener can skip re-broadcasting them.
const REMOTE_ORIGIN = 'remote'

export function useYjsSection(
  socket: Socket | null,
  roomId: string,
  sectionId: string,
  initialState?: number[]
): { ydoc: Y.Doc; isReady: boolean } {
  // Recreated per sectionId — simplest lifecycle, acceptable since sections are
  // relatively small documents and remounts are infrequent.
  const [ydoc, setYdoc] = useState(() => new Y.Doc())

  useEffect(() => {
    const doc = new Y.Doc()
    if (initialState && initialState.length > 0) {
      Y.applyUpdate(doc, new Uint8Array(initialState))
    }
    setYdoc(doc)

    return () => {
      doc.destroy()
    }
    // Only recreate when switching sections; initialState is only relevant on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId])

  useEffect(() => {
    const handleLocalUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE_ORIGIN) return
      socket?.emit('yjs-update', roomId, sectionId, Array.from(update))
    }
    ydoc.on('update', handleLocalUpdate)

    return () => {
      ydoc.off('update', handleLocalUpdate)
    }
  }, [ydoc, socket, roomId, sectionId])

  useEffect(() => {
    if (!socket) return

    const handleRemoteUpdate = (data: { sectionId: string; update: number[] }) => {
      if (data.sectionId !== sectionId) return
      Y.applyUpdate(ydoc, new Uint8Array(data.update), REMOTE_ORIGIN)
    }

    socket.on('yjs-update', handleRemoteUpdate)
    return () => {
      socket.off('yjs-update', handleRemoteUpdate)
    }
  }, [socket, ydoc, sectionId])

  return { ydoc, isReady: true }
}
