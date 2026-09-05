'use client'

import { signOut } from 'next-auth/react'

interface AuthControlsProps {
  name: string
  image?: string
}

/** Avatar + sign out — used in the dashboard and room top bars. */
export function AuthControls({ name, image }: AuthControlsProps) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-[10px] font-medium text-white"
        title={name}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={name} className="h-full w-full object-cover" />
        ) : (
          name[0]?.toUpperCase()
        )}
      </div>
      <span className="hidden max-w-[8rem] truncate text-xs text-fg-muted sm:inline">{name}</span>
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: '/' })}
        className="btn-ghost px-2 py-1 text-xs text-fg-muted"
      >
        Sign out
      </button>
    </div>
  )
}
