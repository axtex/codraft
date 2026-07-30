import Link from 'next/link'

export default function ExplorePage() {
  return (
    <div className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center px-4 text-center">
      <div className="text-5xl">🔭</div>
      <h1 className="mt-4 text-xl font-semibold text-fg">Public rooms — coming soon</h1>
      <p className="mt-2 text-sm text-fg-muted">
        Browsing and discovering public rooms isn&apos;t built yet. For now, create your
        own room or join one via an invite link.
      </p>
      <Link href="/dashboard" className="btn-primary mt-6">
        Back to dashboard
      </Link>
    </div>
  )
}
