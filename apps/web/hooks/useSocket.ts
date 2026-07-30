'use client'

import { useEffect, useState } from 'react'
import { io, Socket } from 'socket.io-client'

export function useSocket(
  roomId: string,
  userId: string,
  userName: string,
  userImage?: string
): { socket: Socket | null; isConnected: boolean } {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    // Guard inside the effect (not around the hook call) to keep hook order stable.
    if (!roomId || !userId) return

    const url = process.env.NEXT_PUBLIC_WS_URL!
    const socketInstance = io(url, { autoConnect: true })

    const handleConnect = () => {
      setIsConnected(true)
      // Re-emitted on every reconnect too, since 'connect' fires again after reconnection.
      socketInstance.emit('join-room', roomId, userId, userName, userImage)
    }
    const handleDisconnect = () => setIsConnected(false)
    const handleConnectError = () => setIsConnected(false)

    socketInstance.on('connect', handleConnect)
    socketInstance.on('disconnect', handleDisconnect)
    socketInstance.on('connect_error', handleConnectError)

    setSocket(socketInstance)

    return () => {
      socketInstance.off('connect', handleConnect)
      socketInstance.off('disconnect', handleDisconnect)
      socketInstance.off('connect_error', handleConnectError)
      socketInstance.disconnect()
      setSocket(null)
      setIsConnected(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, userId, userName, userImage])

  return { socket, isConnected }
}
