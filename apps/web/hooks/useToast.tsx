'use client'

import { useCallback, useRef, useState } from 'react'

const TOAST_MS = 3000

export function useToast(): { toast: string | null; showToast: (message: string) => void } {
  const [toast, setToast] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((message: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setToast(message)
    timerRef.current = setTimeout(() => {
      setToast(null)
      timerRef.current = null
    }, TOAST_MS)
  }, [])

  return { toast, showToast }
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="fixed bottom-4 right-4 z-[60] rounded-lg border border-border bg-bg-card px-4 py-2 text-sm text-fg shadow-lg">
      {message}
    </div>
  )
}
