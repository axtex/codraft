import NextAuth from 'next-auth'
import { authConfig } from './auth.config'

// Edge-safe: auth.config has no Prisma adapter. JWT cookie only.
export default NextAuth(authConfig).auth

export const config = {
  matcher: ['/dashboard/:path*', '/room/:path*'],
}
