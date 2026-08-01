import Link from 'next/link'

export default function ExplorePage() {
  return (
    <div className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center px-4 text-center">
      <h1 className="text-xl font-semibold text-fg">Coming soon</h1>
      <p className="mt-2 text-sm text-fg-muted">
        This page isn&apos;t available yet.
      </p>
      <Link href="/dashboard" className="btn-primary mt-6">
        Back to dashboard
      </Link>
    </div>
  )
}
