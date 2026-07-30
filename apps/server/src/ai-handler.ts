import Anthropic from '@anthropic-ai/sdk'
import type { Server, Socket } from 'socket.io'
import * as Y from 'yjs'
import type { ChatMessage, SectionData } from '@codraft/shared'
import { saveMessage, createSuggestion, prisma } from './db-client'
import { roomManager } from './room-state'

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

async function detectIntent(
  message: string,
  sections: SectionData[]
): Promise<Intent> {
  const sectionNames = sections.map((s) => s.name).join(', ')
  const system = `Classify this message. Reply with:
CHAT — conversational response needed
WRITE:[SectionName] — user wants to write to a specific section
BOTH — answer in chat AND update a section

Available sections: ${sectionNames}

Examples:
  'what hotels are near Shinjuku?' → CHAT
  'write the itinerary into the doc' → WRITE:Itinerary
  'add those hotel options to Hotels' → WRITE:Hotels
  'let's go with the Park Hyatt' → BOTH
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
    const sectionName = text.slice('WRITE:'.length).trim()
    return { type: 'WRITE', sectionName }
  }
  if (text.startsWith('BOTH')) {
    return { type: 'BOTH' }
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

function applyContentToSectionDoc(roomId: string, sectionId: string, content: string): void {
  const ydoc = roomManager.getSectionDoc(roomId, sectionId)
  const ytext = ydoc.getText('content')
  ydoc.transact(() => {
    ytext.delete(0, ytext.length)
    ytext.insert(0, content)
  })
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
    const sectionNames = sections.map((s) => s.name).join(', ')

    const intent = await detectIntent(message, sections)

    const mainSystem = `You are Claude, an AI collaborator in a team workspace called codraft. You are participating in a group chat alongside the team.

Current workspace sections and content:
${sectionContext}

Recent conversation:
${chatHistoryText}

Guidelines:
- Be helpful and concise
- Address the whole group naturally
- Reference section content when relevant
- If writing to a section, format content clearly in markdown
- Keep chat responses under 200 words
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

    // If intent was WRITE and resolves to a real section, push the AI
    // response into that section (DB + live Yjs doc).
    if (intent.type === 'WRITE' && intent.sectionName) {
      const targetSection = sections.find(
        (s) => s.name.toLowerCase() === intent.sectionName?.toLowerCase()
      )
      if (targetSection) {
        const updated = await prisma.section.update({
          where: { id: targetSection.id },
          data: { content: fullText, status: 'filled', updatedBy: 'claude' },
        })
        applyContentToSectionDoc(roomId, targetSection.id, fullText)
        io.to(roomId).emit('section-updated', updated)
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
