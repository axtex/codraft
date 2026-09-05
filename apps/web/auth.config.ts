import type { NextAuthConfig } from 'next-auth'
import Google from 'next-auth/providers/google'

/**
 * Edge-safe NextAuth config — no Prisma, no Node-only APIs.
 * Middleware imports this file only. The full adapter + JWT DB callbacks
 * live in auth.ts for API routes and server components.
 *
 * Provider list must stay identical to auth.ts.
 */
export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // Same email may already exist from the old GitHub provider.
      allowDangerousEmailAccountLinking: true,
    }),
  ],
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
    // Honor relative callbackUrls such as /dashboard?create=true after OAuth.
    async redirect({ url, baseUrl }) {
      if (url.startsWith('/')) return `${baseUrl}${url}`
      try {
        if (new URL(url).origin === baseUrl) return url
      } catch {
        // Invalid absolute URL — fall through to the app origin.
      }
      return baseUrl
    },
  },
}
