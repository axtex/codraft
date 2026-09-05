import type { NextAuthConfig } from 'next-auth'
import GitHub from 'next-auth/providers/github'

/**
 * Edge-safe NextAuth config — no Prisma, no Node-only APIs.
 * Middleware imports this file only. The full adapter + JWT DB callbacks
 * live in auth.ts for API routes and server components.
 */
export const authConfig: NextAuthConfig = {
  providers: [GitHub],
  trustHost: true,
  pages: {
    signIn: '/auth/signin',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isProtected =
        nextUrl.pathname.startsWith('/dashboard') || nextUrl.pathname.startsWith('/room')
      if (isProtected && !isLoggedIn) {
        const signInUrl = new URL('/auth/signin', nextUrl)
        signInUrl.searchParams.set('callbackUrl', `${nextUrl.pathname}${nextUrl.search}`)
        return Response.redirect(signInUrl)
      }
      return true
    },
  },
}
