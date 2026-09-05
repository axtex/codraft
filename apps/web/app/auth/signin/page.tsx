import { SignInButton } from '@/components/SignInButton'

const SIGNIN_ERRORS: Record<string, string> = {
  OAuthAccountNotLinked:
    'This email is already tied to another sign-in method. Try again — we will link it.',
  OAuthCallback: 'Google sign-in failed. Please try again.',
  Callback: 'Sign-in was interrupted. Please try again.',
  Configuration: 'Sign-in is misconfigured. Check Google OAuth credentials.',
  AccessDenied: 'Access was denied. Please try another Google account.',
}

export default function SignInPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string; error?: string }
}) {
  const errorMessage = searchParams?.error
    ? (SIGNIN_ERRORS[searchParams.error] ?? 'Couldn’t sign in. Please try again.')
    : null

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b0b0f] px-4">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#131318] p-8 text-center shadow-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-white">codraft</h1>
        <p className="mt-2 text-sm text-white/50">
          Think together. Build together.
        </p>

        {errorMessage && (
          <p className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {errorMessage}
          </p>
        )}

        <div className="mt-8">
          <SignInButton
            callbackUrl={searchParams?.callbackUrl || '/dashboard?create=true'}
          />
        </div>
      </div>
    </div>
  )
}
