import Link from 'next/link'
import { auth } from '@/auth'
import { TEMPLATES } from '@/lib/templates'
import { RoomPreview } from '@/components/landing/RoomPreview'
import type { RoomTemplate } from '@codraft/shared'

/**
 * Numbered rather than iconed: emoji in a "how it works" row reads as filler,
 * and the ordering is the actual information here.
 */
const STEPS = [
  {
    title: 'Open a room',
    body: 'Pick a template or start blank. codraft scaffolds the sections your doc will need.',
  },
  {
    title: 'Talk it through',
    body: 'Chat with your team like you normally would. Claude is in the room, listening for decisions.',
  },
  {
    title: 'Watch it take shape',
    body: 'Decisions land in the right section as they happen. Edit any of it by hand, anytime.',
  },
]

/** Everything except `custom`, which is the fallback rather than a real choice. */
const TEMPLATE_KEYS = (Object.keys(TEMPLATES) as RoomTemplate[]).filter((k) => k !== 'custom')

export default async function LandingPage() {
  const session = await auth()
  const createRoomHref = session?.user
    ? '/dashboard?create=true'
    : `/auth/signin?callbackUrl=${encodeURIComponent('/dashboard?create=true')}`

  return (
    <>
      {/* The landing page is the only route without an app shell, so it carries its own header */}
      <header className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-5">
        <span className="font-semibold tracking-tight text-fg">codraft</span>
        <Link
          href={session?.user ? '/dashboard' : '/auth/signin'}
          className="text-sm font-medium text-fg-muted transition hover:text-fg"
        >
          {session?.user ? 'Dashboard' : 'Sign in'}
        </Link>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-5xl px-5 pb-4 pt-12 sm:pb-8 sm:pt-20">
          <div className="mx-auto text-center">
            <h1 className="text-[1.65rem] font-semibold leading-[1.05] tracking-[-0.03em] text-fg sm:text-4xl lg:text-5xl">
              Think together. <span className="text-accent">Build together.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-lg text-base leading-relaxed text-fg-muted sm:text-lg">
              A room is a conversation and a document.
              <br />
              You talk — Claude turns the decisions into structured sections as they happen.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href={createRoomHref} className="btn-primary">
                Create a room
              </Link>
              <a
                href="#how-it-works"
                className="text-sm font-medium text-fg-muted transition hover:text-fg"
              >
                How it works ↓
              </a>
            </div>
          </div>

          {/* Show the product before describing it */}
          <div className="mx-auto mt-12 max-w-3xl sm:mt-16">
            <RoomPreview />
          </div>
        </section>

        {/* Templates — a quiet inventory, not a card grid competing with the hero */}
        <section className="mt-16 border-t border-border sm:mt-24">
          <div className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
            <div className="sm:flex sm:items-start sm:justify-between sm:gap-12">
              <div className="max-w-sm">
                <h2 className="text-2xl font-semibold tracking-tight text-fg">
                  Start from a template
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                  Each one comes with its sections already laid out. Name your room and
                  codraft picks the closest match — override it if you&apos;d rather.
                </p>
              </div>
              <ul className="mt-6 grid gap-x-8 gap-y-3 sm:mt-1 sm:grid-cols-2">
                {TEMPLATE_KEYS.map((key) => {
                  const tpl = TEMPLATES[key]
                  return (
                    <li
                      key={key}
                      className="flex items-baseline justify-between gap-4 border-b border-border pb-3 sm:min-w-[13rem]"
                    >
                      <span className="text-sm font-medium text-fg">{tpl.label}</span>
                      <span className="shrink-0 font-mono text-[11px] text-fg-subtle">
                        {tpl.sections.length} sections
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-t border-border bg-bg-surface">
          <div className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
            <div className="grid gap-10 sm:grid-cols-3 sm:gap-8">
              {STEPS.map((step, i) => (
                <div key={step.title}>
                  <span className="font-mono text-xs text-accent">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="mt-3 text-base font-semibold tracking-tight text-fg">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-1 px-5 py-8 sm:flex-row sm:justify-between sm:gap-0">
          <span className="text-sm font-semibold tracking-tight text-fg">codraft</span>
          <span className="text-xs text-fg-subtle">Think together. Build together.</span>
        </div>
      </footer>
    </>
  )
}
