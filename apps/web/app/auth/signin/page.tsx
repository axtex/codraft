import Link from 'next/link'
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
    <>
      <header className="mx-auto flex h-16 w-full max-w-5xl items-center px-5">
        <Link href="/" className="font-semibold tracking-tight text-fg">
          codraft
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-5">
        <div className="card w-full max-w-sm px-6 py-8 text-center">
          <h1 className="text-base font-semibold tracking-tight text-fg">
            Sign in to open one.
          </h1>

          {errorMessage && (
            <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">
              {errorMessage}
            </p>
          )}

          <div className="mt-6">
            <SignInButton
              callbackUrl={searchParams?.callbackUrl || '/dashboard?create=true'}
            />
          </div>
        </div>
      </main>
    </>
  )
}
