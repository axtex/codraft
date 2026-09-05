'use client'

import { useCallback, useEffect, useState } from 'react'
import { io, Socket } from 'socket.io-client'

export function useSocket(
  roomId: string,
  userId: string,
  userName: string,
  userImage?: string
): {
  socket: Socket | null
  isConnected: boolean
  isReconnecting: boolean
  reconnect: () => void
} {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isReconnecting, setIsReconnecting] = useState(false)

  useEffect(() => {
    // Guard inside the effect (not around the hook call) to keep hook order stable.
    if (!roomId || !userId) return

    const url = process.env.NEXT_PUBLIC_WS_URL
    if (!url) {
      console.error('[useSocket] NEXT_PUBLIC_WS_URL is not set')
      return
    }

    // Polling first, then upgrade — Railway's proxy is more reliable that way
    // than opening a raw WebSocket immediately. Rejoin the room on every
    // connect, including auto-reconnect after a dropped session.
    const socketInstance = io(url, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      timeout: 20000,
      transports: ['polling', 'websocket'],
      withCredentials: true,
    })

    const handleConnect = () => {
      setIsConnected(true)
      setIsReconnecting(false)
      socketInstance.emit('join-room', roomId, userId, userName, userImage)
    }
    const handleDisconnect = (reason: string) => {
      setIsConnected(false)
      if (reason !== 'io client disconnect') setIsReconnecting(true)
    }
    const handleConnectError = (err: Error) => {
      setIsConnected(false)
      setIsReconnecting(true)
      console.warn('[useSocket] connect_error:', err.message)
    }
    const handleReconnectAttempt = () => {
      setIsReconnecting(true)
    }

    socketInstance.on('connect', handleConnect)
    socketInstance.on('disconnect', handleDisconnect)
    socketInstance.on('connect_error', handleConnectError)
    socketInstance.io.on('reconnect_attempt', handleReconnectAttempt)

    setSocket(socketInstance)

    return () => {
      socketInstance.off('connect', handleConnect)
      socketInstance.off('disconnect', handleDisconnect)
      socketInstance.off('connect_error', handleConnectError)
      socketInstance.io.off('reconnect_attempt', handleReconnectAttempt)
      socketInstance.disconnect()
      setSocket(null)
      setIsConnected(false)
      setIsReconnecting(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, userId, userName, userImage])

  const reconnect = useCallback(() => {
    if (!socket) return
    setIsReconnecting(true)
    if (socket.connected) {
      socket.disconnect()
    }
    socket.connect()
  }, [socket])

  return { socket, isConnected, isReconnecting, reconnect }
}
