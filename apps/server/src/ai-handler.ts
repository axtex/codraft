import Anthropic from '@anthropic-ai/sdk'
import type { Server, Socket } from 'socket.io'
import type { ChatMessage, SectionData } from '@codraft/shared'
import { saveMessage, createSuggestion, prisma } from './db-client'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Pinned Haiku snapshot per project convention — never the plain alias.
const MODEL = 'claude-haiku-4-5-20251001'

interface Intent {
  type: 'CHAT' | 'WRITE' | 'BOTH'
  sectionName?: string
}

function buildSectionContext(sections: SectionData[]): string {
  const lines = sections.map((s) => `[${s.name}]: ${s.content || 'empty'}`)
  return `=== SECTIONS ===\n${lines.join('\n')}`
}

function buildChatHistoryText(chatHistory: ChatMessage[]): string {
  return chatHistory
    .slice(-20)
    .map((m) => `${m.type === 'AI' ? 'Claude' : m.userName}: ${m.content}`)
    .join('\n')
}

/** Match "Ask Claude to fill" button phrasing and close variants — no AI call needed. */
function detectFillRequest(message: string, sections: SectionData[]): Intent | null {
  const fillMatch = message.match(/fill(?:\s+in)?\s+the\s+(.+?)\s+section\b/i)
  if (!fillMatch?.[1]) return null

  const requested = fillMatch[1].trim()
  const exact = sections.find((s) => s.name.toLowerCase() === requested.toLowerCase())
  if (exact) return { type: 'WRITE', sectionName: exact.name }

  const fuzzy = sections.find(
    (s) =>
      s.name.toLowerCase().includes(requested.toLowerCase()) ||
      requested.toLowerCase().includes(s.name.toLowerCase())
  )
  if (fuzzy) return { type: 'WRITE', sectionName: fuzzy.name }

  return null
}

function resolveSectionName(raw: string, sections: SectionData[]): string | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  const exact = sections.find((s) => s.name.toLowerCase() === trimmed.toLowerCase())
  if (exact) return exact.name
  const fuzzy = sections.find(
    (s) =>
      s.name.toLowerCase().includes(trimmed.toLowerCase()) ||
      trimmed.toLowerCase().includes(s.name.toLowerCase())
  )
  return fuzzy?.name
}

async function detectIntent(
  message: string,
  sections: SectionData[]
): Promise<Intent> {
  // Deterministic path for the section-card button — classifier often returns CHAT
  // for "please fill the X section", which skips the write.
  const fillIntent = detectFillRequest(message, sections)
  if (fillIntent) return fillIntent

  const sectionNames = sections.map((s) => s.name).join(', ')
  const system = `Classify this message. Reply with:
CHAT — conversational response needed
WRITE:[SectionName] — user wants to write to a specific section
BOTH:[SectionName] — answer in chat AND update a section

Available sections: ${sectionNames}

Examples:
  'what hotels are near Shinjuku?' → CHAT
  'write the itinerary into the doc' → WRITE:Itinerary
  'add those hotel options to Hotels' → WRITE:Hotels
  'Claude, please fill the Hotels section based on our conversation' → WRITE:Hotels
  'let's go with the Park Hyatt' → BOTH:Hotels
  'how long is the flight?' → CHAT`

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 20,
    system,
    messages: [{ role: 'user', content: message }],
  })

  const text = response.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim()

  if (text.startsWith('WRITE:')) {
    const sectionName = resolveSectionName(text.slice('WRITE:'.length), sections)
    return { type: 'WRITE', sectionName }
  }
  if (text.startsWith('BOTH')) {
    const after = text.startsWith('BOTH:') ? text.slice('BOTH:'.length) : ''
    return { type: 'BOTH', sectionName: resolveSectionName(after, sections) }
  }
  return { type: 'CHAT' }
}

async function detectExtraction(
  message: string,
  sections: SectionData[],
  chatHistoryText: string
): Promise<{ sectionName: string; content: string } | null> {
  const sectionNames = sections.map((s) => s.name).join(', ')
  const sectionContext = buildSectionContext(sections)
  const system = `You monitor team conversations for decisions that should be captured in the workspace sections.

Available sections: ${sectionNames}
Current section contents: ${sectionContext}

If the message contains a clear decision, fact, or piece of information that belongs in one of the sections AND is not already there, reply with:
EXTRACT:[SectionName]:[content to add]

If nothing to extract, reply: NONE

Only extract clear, concrete decisions. Not questions or speculation.

Examples:
  'let's stay in Shinjuku' → EXTRACT:Hotels:Shinjuku area preferred
  'budget is $3000 total' → EXTRACT:Budget:Total budget: $3,000
  'where should we stay?' → NONE
  'maybe Tokyo?' → NONE`

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 100,
    system,
    messages: [
      {
        role: 'user',
        content: `Recent conversation:\n${chatHistoryText}\n\nLatest message: ${message}`,
      },
    ],
  })

  const text = response.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim()

  if (!text.startsWith('EXTRACT:')) return null

  const rest = text.slice('EXTRACT:'.length)
  const firstColon = rest.indexOf(':')
  if (firstColon === -1) return null

  const sectionName = rest.slice(0, firstColon).trim()
  const content = rest.slice(firstColon + 1).trim()
  if (!sectionName || !content) return null

  return { sectionName, content }
}

async function writeAiContentToSection(
  io: Server,
  roomId: string,
  targetSection: SectionData,
  content: string
): Promise<void> {
  // Persist content + status in Postgres. TipTap binds to Y.XmlFragment('default'),
  // not Y.Text — the live editor is updated by clients on `section-updated`.
  const updated = await prisma.section.update({
    where: { id: targetSection.id },
    data: { content, status: 'filled', updatedBy: 'claude' },
  })
  io.to(roomId).emit('section-updated', updated)
}

async function generateSectionMarkdown(
  section: SectionData,
  sectionContext: string,
  chatHistoryText: string
): Promise<string> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    system: `You fill one section of a collaborative workspace document called codraft.

Current workspace sections:
${sectionContext}

Recent conversation:
${chatHistoryText}

Write clear markdown for the "${section.name}" section only, based on the conversation. Max 200 words. Output the section content only — no preamble or explanation.`,
    messages: [
      {
        role: 'user',
        content: `Fill the "${section.name}" section based on our conversation.`,
      },
    ],
  })

  return response.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim()
}

async function notifySectionFilled(
  io: Server,
  roomId: string,
  sectionName: string
): Promise<void> {
  // Persisted chat breadcrumb — full draft lives in the doc. EXTRACTION renders
  // as a lasting pill in history (SYSTEM styling is easy to miss as ephemeral).
  const savedMessage = await saveMessage({
    roomId,
    userId: null,
    userName: 'Claude',
    content: `Added to ${sectionName}`,
    type: 'EXTRACTION',
  })
  io.to(roomId).emit('new-message', savedMessage)
}

/** Button / explicit fill — writes the doc, posts a one-line chat notice (no draft dump). */
export async function handleFillSection(
  io: Server,
  roomId: string,
  sectionName: string,
  chatHistory: ChatMessage[],
  sections: SectionData[]
): Promise<void> {
  try {
    const target =
      sections.find((s) => s.name.toLowerCase() === sectionName.toLowerCase()) ??
      sections.find(
        (s) =>
          s.name.toLowerCase().includes(sectionName.toLowerCase()) ||
          sectionName.toLowerCase().includes(s.name.toLowerCase())
      )
    if (!target) return

    const content = await generateSectionMarkdown(
      target,
      buildSectionContext(sections),
      buildChatHistoryText(chatHistory)
    )
    if (!content) return

    await writeAiContentToSection(io, roomId, target, content)
    await notifySectionFilled(io, roomId, target.name)
  } catch (err) {
    console.error('[ai-handler] handleFillSection failed:', err)
  }
}

export async function handleMessage(
  io: Server,
  socket: Socket,
  roomId: string,
  message: string,
  userId: string,
  userName: string,
  chatHistory: ChatMessage[],
  sections: SectionData[]
): Promise<void> {
  try {
    const sectionContext = buildSectionContext(sections)
    const chatHistoryText = buildChatHistoryText(chatHistory)

    const intent = await detectIntent(message, sections)
    const writingToSection =
      (intent.type === 'WRITE' || intent.type === 'BOTH') && intent.sectionName
        ? sections.find((s) => s.name.toLowerCase() === intent.sectionName?.toLowerCase())
        : undefined

    // WRITE-only: put the draft in the doc and leave a short chat notice.
    // Avoid streaming the full section body into the thread.
    if (intent.type === 'WRITE' && writingToSection) {
      const content = await generateSectionMarkdown(
        writingToSection,
        sectionContext,
        chatHistoryText
      )
      if (content) {
        await writeAiContentToSection(io, roomId, writingToSection, content)
        await notifySectionFilled(io, roomId, writingToSection.name)
      }
      return
    }

    const mainSystem = `You are Claude, an AI collaborator in a team workspace called codraft. You are participating in a group chat alongside the team.

Current workspace sections and content:
${sectionContext}

Recent conversation:
${chatHistoryText}

Guidelines:
- Be helpful and concise
- Address the whole group naturally
- Reference section content when relevant
${
  writingToSection
    ? `- A decision in this message should also update "${writingToSection.name}". Keep your chat reply short (under 80 words) — do not paste the full section draft into chat.`
    : `- Keep chat responses under 200 words`
}
- Don't explain what you're doing, just do it`

    let fullText = ''
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 500,
      system: mainSystem,
      messages: [{ role: 'user', content: message }],
    })

    stream.on('text', (chunk) => {
      fullText += chunk
      io.to(roomId).emit('ai-response-chunk', { chunk })
    })

    await stream.finalMessage()

    const savedMessage = await saveMessage({
      roomId,
      userId: null,
      userName: 'Claude',
      content: fullText,
      type: 'AI',
    })
    io.to(roomId).emit('new-message', savedMessage)

    // BOTH: short chat reply above; generate section body separately so chat stays clean.
    if (intent.type === 'BOTH' && writingToSection) {
      const content = await generateSectionMarkdown(
        writingToSection,
        sectionContext,
        chatHistoryText
      )
      if (content) {
        await writeAiContentToSection(io, roomId, writingToSection, content)
        await notifySectionFilled(io, roomId, writingToSection.name)
      }
    }

    // Always separately run extraction detection — independent of the
    // chat/write intent above, since a decision can surface in casual chat.
    const extraction = await detectExtraction(message, sections, chatHistoryText)
    if (extraction) {
      const matchedSection = sections.find(
        (s) => s.name.toLowerCase() === extraction.sectionName.toLowerCase()
      )
      if (matchedSection) {
        const suggestion = await createSuggestion({
          roomId,
          sectionId: matchedSection.id,
          content: extraction.content,
          reasoning: `Claude noticed a decision relevant to ${matchedSection.name}`,
        })
        io.to(roomId).emit('extraction-suggestion', suggestion)
      }
    }
  } catch (err) {
    // This runs fire-and-forget from socket-handlers.ts — an unhandled
    // rejection here would crash the process, so swallow and log instead.
    console.error('[ai-handler] handleMessage failed:', err)
  }
}
