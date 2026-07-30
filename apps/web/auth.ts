import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/prisma'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  trustHost: true,
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
    }),
  ],
  pages: {
    signIn: '/auth/signin',
  },
  callbacks: {
    async jwt({ token, user, profile }) {
      if (user) {
        token.id = user.id

        // GitHub's `profile.login` is the username — capture it on first
        // sign-in so we can persist it to the User row below.
        const githubLogin =
          profile && 'login' in profile ? (profile.login as string) : undefined
        if (githubLogin) {
          token.username = githubLogin

          const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
          if (dbUser && !dbUser.username) {
            await prisma.user.update({
              where: { id: user.id },
              data: { username: githubLogin },
            })
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
