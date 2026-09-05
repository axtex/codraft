import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/prisma'
import { authConfig } from './auth.config'

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // Must match auth.config.ts providers exactly.
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // Same email may already exist from the old GitHub provider.
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id

        // Google has no GitHub-style login; use the email local-part for room slugs.
        const emailLocal = user.email?.split('@')[0]?.toLowerCase().replace(/[^a-z0-9._-]/g, '')
        if (emailLocal) {
          token.username = emailLocal

          const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
          if (dbUser && !dbUser.username) {
            const taken = await prisma.user.findUnique({ where: { username: emailLocal } })
            const username = taken ? `${emailLocal}-${user.id.slice(-4)}` : emailLocal
            await prisma.user.update({
              where: { id: user.id },
              data: { username },
            })
            token.username = username
          }
        } else if (!token.username) {
          const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
          token.username = dbUser?.username ?? undefined
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.username = token.username as string | undefined
      }
      return session
    },
  },
})
