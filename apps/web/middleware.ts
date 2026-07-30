import { auth } from '@/auth'
import { NextResponse } from 'next/server'

// Public routes: /, /join/[token], /explore, /auth/*
// Everything else under the matcher below requires a session.
const PUBLIC_PREFIXES = ['/join', '/explore', '/auth']

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isPublic =
    pathname === '/' || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))

  if (isPublic) return NextResponse.next()

  if (!req.auth) {
    const signInUrl = new URL('/auth/signin', req.nextUrl.origin)
    signInUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(signInUrl)
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/dashboard/:path*', '/room/:path*'],
}
