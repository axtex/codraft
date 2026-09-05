/**
 * Static, non-interactive mock of a real codraft room.
 *
 * The product's core idea — "a room is a conversation and a document" — is hard
 * to explain in prose, so the landing page shows it instead: chat on the left,
 * sections filling in on the right. Deliberately not wired to any state; it is
 * decoration, hidden from assistive tech, and reuses the real `section-card`
 * class so the preview stays honest if those styles ever change.
 */

interface ChatLine {
  author: string
  /** Initial-avatar tint — kept inline since these are one-off preview colors. */
  tint: string
  body: string
}

const CHAT: ChatLine[] = [
  { author: 'Maya', tint: '#13367d', body: 'Kyoto, April 3–7. Flights are cheapest that week.' },
  { author: 'Ellis', tint: '#10b981', body: 'Works for me. Can we stay at a ryokan near Gion?' },
  { author: 'Maya', tint: '#13367d', body: 'Yes — budget around $1,800 each, all in.' },
]

interface PreviewSection {
  title: string
  /** Mirrors the SectionStatus values the room workspace renders. */
  status: 'filled' | 'in_progress' | 'empty'
  body?: string
}

const SECTIONS: PreviewSection[] = [
  { title: 'Itinerary', status: 'filled', body: 'April 3–7 · Kyoto · 5 days' },
  { title: 'Hotels', status: 'in_progress', body: 'Ryokan near Gion — comparing 3 options' },
  { title: 'Budget', status: 'filled', body: '$1,800 per person, all in' },
  { title: 'Packing List', status: 'empty' },
]

const STATUS_LABEL: Record<PreviewSection['status'], string> = {
  filled: 'Filled',
  in_progress: 'Writing…',
  empty: 'Empty',
}

export function RoomPreview() {
  return (
    <div
      aria-hidden="true"
      className="card overflow-hidden text-left shadow-lg shadow-black/[0.04]"
    >
      {/* Window chrome — grounds the mock as "an app", not a diagram */}
      <div className="flex items-center gap-2 border-b border-border bg-bg-surface px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-border-bright" />
          <span className="h-2.5 w-2.5 rounded-full bg-border-bright" />
          <span className="h-2.5 w-2.5 rounded-full bg-border-bright" />
        </div>
        <span className="ml-1 truncate font-mono text-[11px] text-fg-subtle">
          codraft.app/maya/kyoto-trip
        </span>
      </div>

      <div className="grid sm:grid-cols-2">
        {/* Conversation */}
        <div className="space-y-3 border-b border-border p-4 sm:border-b-0 sm:border-r sm:p-5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-subtle">
            Conversation
          </p>
          {CHAT.map((line) => (
            <div key={line.body} className="flex gap-2.5">
              <span
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-white"
                style={{ background: line.tint }}
              >
                {line.author[0]}
              </span>
              <div className="min-w-0">
                <span className="text-[11px] font-medium text-fg-muted">{line.author}</span>
                <p className="text-[13px] leading-snug text-fg">{line.body}</p>
              </div>
            </div>
          ))}

          {/* The moment the product exists for: Claude turning talk into structure */}
          <div className="flex items-center gap-2 rounded-md bg-accent-muted px-2.5 py-2">
            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" />
            <p className="text-[12px] text-accent">
              Claude updated <span className="font-medium">Itinerary</span>,{' '}
              <span className="font-medium">Hotels</span> and{' '}
              <span className="font-medium">Budget</span>
            </p>
          </div>
        </div>

        {/* Document */}
        <div className="space-y-2 bg-bg-surface/60 p-4 sm:p-5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-subtle">
            Document
          </p>
          {SECTIONS.map((section) => (
            <div
              key={section.title}
              className={`section-card section-card--${section.status} px-3 py-2.5`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-medium text-fg">{section.title}</span>
                <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-fg-subtle">
                  {STATUS_LABEL[section.status]}
                </span>
              </div>
              {section.body ? (
                <p className="mt-1 text-[12px] leading-snug text-fg-muted">{section.body}</p>
              ) : (
                // Placeholder bars read as "nothing here yet" faster than any label
                <div className="mt-2 space-y-1.5">
                  <div className="h-1.5 w-4/5 rounded-full bg-border" />
                  <div className="h-1.5 w-1/2 rounded-full bg-border" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
