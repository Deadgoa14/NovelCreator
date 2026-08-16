import type { ReactNode } from 'react'
import type { Concept } from './types'

export interface ConceptEntry {
  text: string
  concept: Concept
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Build a longest-first regex alternation for every concept name + alias, plus
 * the matching entries (to look up which concept a given match belongs to). */
export function compileConcepts(concepts: Concept[]): { entries: ConceptEntry[]; regex: RegExp | null } {
  const entries: ConceptEntry[] = []
  for (const c of concepts) {
    const names = [c.name, ...(c.aliases ?? [])].filter((n) => n && n.trim().length > 0)
    for (const n of names) entries.push({ text: n, concept: c })
  }
  entries.sort((a, b) => b.text.length - a.text.length)
  const pattern = entries.map((e) => escapeRegExp(e.text)).join('|')
  return { entries, regex: pattern ? new RegExp(pattern, 'g') : null }
}

/** Split `text` into React nodes, wrapping concept name/alias matches in a colored span. */
export function highlightText(text: string, concepts: Concept[]): ReactNode[] {
  const { entries, regex } = compileConcepts(concepts)
  if (!regex || !text) return [text]
  const out: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let key = 0
  regex.lastIndex = 0
  while ((m = regex.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const matched = m[0]
    const concept = entries.find((e) => e.text === matched)?.concept
    out.push(
      <span
        key={key++}
        style={{
          color: concept?.color,
          backgroundColor: concept?.color ? `${concept.color}22` : undefined,
          borderRadius: 3,
        }}
      >
        {matched}
      </span>,
    )
    last = m.index + matched.length
    if (matched.length === 0) regex.lastIndex++
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
