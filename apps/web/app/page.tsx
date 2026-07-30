import Link from 'next/link'
import { TEMPLATES } from '@/lib/templates'

const STEPS = [
  { icon: '💬', body: 'Chat naturally with your team and Claude' },
  { icon: '🎯', body: 'Claude detects decisions automatically' },
  { icon: '✅', body: 'Accept suggestions — your doc builds itself' },
]

const SHOWCASE_TEMPLATES = ['trip', 'meeting', 'project'] as const

export default function LandingPage() {
  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="mx-auto flex max-w-3xl flex-col items-center px-4 pb-16 pt-20 text-center sm:pt-28">
        <h1 className="text-4xl font-bold tracking-tight text-fg sm:text-6xl">
          Think together.
          <br />
          <span className="text-accent">Build together.</span>
        </h1>
        <p className="mt-6 max-w-xl text-base text-fg-muted sm:text-lg">
          A collaborative workspace where your team and Claude turn conversations
          into structured documents — automatically.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Link href="/dashboard" className="btn-primary px-6 py-3 text-base">
            Create a room
          </Link>
          <a href="#how-it-works" className="btn-ghost px-6 py-3 text-base">
            See how it works ↓
          </a>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-t border-border bg-bg-surface py-16">
        <div className="mx-auto grid max-w-4xl gap-8 px-4 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <div key={step.body} className="flex flex-col items-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-muted text-2xl">
                {step.icon}
              </div>
              <h3 className="mt-4 text-sm font-semibold text-fg-subtle">Step {i + 1}</h3>
              <p className="mt-1 text-base font-medium text-fg">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Template showcase */}
      <section className="py-16">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-center text-2xl font-bold text-fg">Start from a template</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {SHOWCASE_TEMPLATES.map((key) => {
              const tpl = TEMPLATES[key]
              return (
                <div key={key} className="card p-5">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{tpl.icon}</span>
                    <span className="font-semibold text-fg">{tpl.label}</span>
                  </div>
                  <ul className="mt-3 space-y-1 text-sm text-fg-muted">
                    {tpl.sections.slice(0, 4).map((s) => (
                      <li key={s}>• {s}</li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
          <p className="mt-6 text-center text-sm text-fg-subtle">and more...</p>
        </div>
      </section>
    </main>
  )
}
