import { signIn } from '@/auth'

export default function SignInPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string }
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b0b0f] px-4">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#131318] p-8 text-center shadow-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-white">codraft</h1>
        <p className="mt-2 text-sm text-white/50">
          Think together. Build together.
        </p>

        <form
          action={async () => {
            'use server'
            await signIn('github', {
              redirectTo: searchParams?.callbackUrl || '/dashboard',
            })
          }}
          className="mt-8"
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-md bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-400"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
              <path d="M12 .5C5.73.5.5 5.74.5 12.02c0 5.02 3.26 9.28 7.79 10.79.57.1.78-.25.78-.55 0-.27-.01-1.16-.02-2.11-3.17.69-3.84-1.36-3.84-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.75 1.18 1.75 1.18 1.02 1.75 2.68 1.24 3.33.95.1-.74.4-1.24.72-1.53-2.53-.29-5.19-1.27-5.19-5.63 0-1.24.44-2.26 1.17-3.05-.12-.29-.51-1.45.11-3.02 0 0 .96-.31 3.14 1.17a10.9 10.9 0 0 1 5.72 0c2.18-1.48 3.14-1.17 3.14-1.17.62 1.57.23 2.73.11 3.02.73.79 1.17 1.81 1.17 3.05 0 4.37-2.67 5.33-5.21 5.62.41.36.77 1.06.77 2.14 0 1.55-.01 2.79-.01 3.17 0 .3.2.66.79.55A10.53 10.53 0 0 0 23.5 12c0-6.28-5.23-11.5-11.5-11.5Z" />
            </svg>
            Continue with GitHub
          </button>
        </form>
      </div>
    </div>
  )
}
