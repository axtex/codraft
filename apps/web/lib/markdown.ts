/**
 * Convert Claude's markdown section fills into HTML TipTap can ingest via setContent.
 * Covers the subset we actually generate: headings, lists, checklists, bold/italic/code.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function renderInline(text: string): string {
  // Escape first, then re-introduce intentional markdown markers as tags.
  // Bold before italic so **...** isn't partially eaten by the single-* rule.
  let html = escapeHtml(text)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  return html
}

export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i] ?? ''

    if (line.trim() === '') {
      i += 1
      continue
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading) {
      const level = heading[1].length
      out.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`)
      i += 1
      continue
    }

    // Unordered / checklist block
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i] ?? '')) {
        const raw = (lines[i] ?? '').replace(/^[-*]\s+/, '')
        const checked = /^\[x\]\s+/i.test(raw)
        const unchecked = /^\[\s?\]\s+/.test(raw)
        const body = checked
          ? raw.replace(/^\[x\]\s+/i, '')
          : unchecked
            ? raw.replace(/^\[\s?\]\s+/, '')
            : raw
        const prefix = checked ? '☑ ' : unchecked ? '☐ ' : ''
        items.push(`<li>${prefix}${renderInline(body)}</li>`)
        i += 1
      }
      out.push(`<ul>${items.join('')}</ul>`)
      continue
    }

    // Ordered list block
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i] ?? '')) {
        const body = (lines[i] ?? '').replace(/^\d+\.\s+/, '')
        items.push(`<li>${renderInline(body)}</li>`)
        i += 1
      }
      out.push(`<ol>${items.join('')}</ol>`)
      continue
    }

    // Paragraph: merge consecutive non-blank, non-structural lines
    const para: string[] = []
    while (
      i < lines.length &&
      (lines[i] ?? '').trim() !== '' &&
      !/^(#{1,3})\s+/.test(lines[i] ?? '') &&
      !/^[-*]\s+/.test(lines[i] ?? '') &&
      !/^\d+\.\s+/.test(lines[i] ?? '')
    ) {
      para.push((lines[i] ?? '').trim())
      i += 1
    }
    out.push(`<p>${renderInline(para.join(' '))}</p>`)
  }

  return out.join('') || '<p></p>'
}
