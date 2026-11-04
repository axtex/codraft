// Closed port and a fetch guard so a missed mock cannot reach live services.
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/codraft_tests'
process.env.ANTHROPIC_API_KEY = 'test-key-not-used'
process.env.GOOGLE_CLIENT_ID = 'test-google-client'
process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret'
process.env.AUTH_SECRET = 'test-auth-secret'
process.env.NEXTAUTH_URL = 'http://localhost:3000'
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
process.env.NEXT_PUBLIC_WS_URL = ''
process.env.WS_SERVER_URL = ''
process.env.UPSTASH_REDIS_REST_URL = ''
process.env.UPSTASH_REDIS_REST_TOKEN = ''
process.env.ADMIN_SECRET = ''

const realFetch = globalThis.fetch.bind(globalThis)

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  let host = ''
  try {
    host = new URL(url).host
  } catch {
    throw new Error(`Refusing non-absolute fetch in tests: ${url}`)
  }
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(`Refusing outbound request in tests: ${url}`)
  }
  return realFetch(input, init)
}
