import { create } from 'zustand'

export interface ParsedNode {
  title: string
  text: string
  notes: string[]
  questions: string[]
  body: string
}

export interface ParsedVolume {
  name: string
  nodes: ParsedNode[]
}

export interface ParsedDoc {
  loose: ParsedNode[]
  volumes: ParsedVolume[]
}

export interface MdRules {
  volumeLevel: number // 1-6：映射到「卷」
  nodeLevel: number // 1-6：映射到「剧情节点」
  noteLevel: number // 1-6：映射到「梗概/要点」
  italicAsNote: boolean // 斜体 `*text*` 是否解析为非正文（写作要点）
  ignoreStrike: boolean // 是否忽略删除线 `~~text~~`
}

export const DEFAULT_MD_RULES: MdRules = {
  volumeLevel: 4,
  nodeLevel: 5,
  noteLevel: 6,
  italicAsNote: false,
  ignoreStrike: true,
}

// Strip the author's inline emphasis / highlight markers, keeping the text.
function stripMd(s: string): string {
  return s.replace(/\*\*/g, '').replace(/==/g, '').trim()
}

function isQuestion(s: string): boolean {
  return /[？?]$/.test(s.trim())
}

function extractItalic(s: string): { text: string; italics: string[] } {
  const italics: string[] = []
  const text = s.replace(/\*([^*\n]+)\*/g, (_, inner: string) => {
    italics.push(inner.trim())
    return ''
  })
  return { text, italics }
}

export function parseNovelMd(text: string, rules: MdRules): ParsedDoc {
  const doc: ParsedDoc = { loose: [], volumes: [] }
  let curVol: ParsedVolume | null = null
  let curNode: ParsedNode | null = null
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim()
    if (!line) continue
    if (rules.ignoreStrike) {
      line = line.replace(/~~[^~]*~~/g, '').trim()
      if (!line) continue
    }
    const m = line.match(/^(#{1,6})\s+(.*)$/)
    if (m) {
      const level = m[1].length
      const content = stripMd(m[2])
      if (level === rules.volumeLevel) {
        curVol = { name: content || '未命名卷', nodes: [] }
        doc.volumes.push(curVol)
        curNode = null
      } else if (level === rules.nodeLevel) {
        curNode = { title: content, text: content, notes: [], questions: [], body: '' }
        if (curVol) curVol.nodes.push(curNode)
        else doc.loose.push(curNode)
      } else if (level === rules.noteLevel) {
        if (curNode && content) {
          if (isQuestion(content)) curNode.questions.push(content)
          else curNode.notes.push(content)
        }
      }
      // 其它标题级别忽略
      continue
    }
    if (rules.italicAsNote) {
      const { text: rest, italics } = extractItalic(stripMd(line))
      if (curNode) {
        curNode.notes.push(...italics)
        if (rest.trim()) curNode.body = curNode.body ? curNode.body + '\n' + rest.trim() : rest.trim()
      }
    } else {
      const prose = stripMd(line)
      if (curNode && prose) curNode.body = curNode.body ? curNode.body + '\n' + prose : prose
    }
  }
  return doc
}

interface MdImportState {
  text: string
  doc: ParsedDoc | null
  sel: Set<string>
  rules: MdRules
  setText: (v: string) => void
  setDoc: (d: ParsedDoc | null) => void
  setSel: (s: Set<string>) => void
  setRules: (r: MdRules) => void
  clear: () => void
}

export const useMdImport = create<MdImportState>((set) => ({
  text: '',
  doc: null,
  sel: new Set(),
  rules: { ...DEFAULT_MD_RULES },
  setText: (text) => set({ text }),
  setDoc: (doc) => set({ doc }),
  setSel: (sel) => set({ sel }),
  setRules: (rules) => set({ rules }),
  clear: () => set({ text: '', doc: null, sel: new Set() }),
}))
