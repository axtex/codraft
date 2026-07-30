import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `Generate brief starter content for a collaborative document section. Return clean markdown only. Max 100 words. Make it a useful starting point — bullet points, headers, or short prompts that help the team get started. Leave blanks for the team to fill in.`

/**
 * Generates starter markdown for a single section. Called once per section
 * on room creation and once when a custom section is added — never on a
 * timer or file save.
 */
export async function generateSectionContent(
  roomName: string,
  sectionName: string
): Promise<string> {
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Room: '${roomName}'\nSection: '${sectionName}'\nGenerate starter content.`,
        },
      ],
    })

    const textBlock = response.content.find((block) => block.type === 'text')
    if (textBlock && textBlock.type === 'text') {
      return textBlock.text.trim()
    }
    return `## ${sectionName}\n\n_Start writing here..._`
  } catch (error) {
    // Section generation must never crash room creation — fall back to a
    // plain placeholder if the API call fails for any reason.
    console.error(`generateSectionContent failed for "${sectionName}":`, error)
    return `## ${sectionName}\n\n_Start writing here..._`
  }
}
