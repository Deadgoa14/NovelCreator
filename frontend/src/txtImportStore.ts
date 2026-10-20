import { create } from 'zustand'

export interface TxtChapter {
  title: string
  content: string
}

export type TxtPattern = 'auto' | '第X章' | '第1章' | '数字' | '特殊'

export interface TxtImportSettings {
  pattern: TxtPattern
  keepNumber: boolean
  importOrder: boolean
}

export const DEFAULT_TXT_SETTINGS: TxtImportSettings = {
  pattern: 'auto',
  keepNumber: false,
  importOrder: false,
}

// 各标题序号模式（匹配到行首的「序号」部分）。
const PATTERNS: Record<Exclude<TxtPattern, 'auto'>, RegExp> = {
  '第X章': /^第[一二三四五六七八九十百千万零〇0-9]+[章回节卷部篇集]/,
  '第1章': /^第\s*\d+\s*[章回节]/,
  '数字': /^\d+[.、．]\s*/,
  '特殊': /^(序章|序言|楔子|引子|尾声|后记|番外|终章|正文)/,
}

// 标题剩余部分最多这么长，再长就当成正文（避免正文里长句被误判成标题）。
const MAX_TITLE_LEN = 40

export function parseNovelTxt(text: string, settings: TxtImportSettings): TxtChapter[] {
  const patterns = settings.pattern === 'auto' ? Object.values(PATTERNS) : [PATTERNS[settings.pattern]]
  const lines = text.split(/\r?\n/)
  const chapters: TxtChapter[] = []
  let curTitle = ''
  let curContent: string[] = []

  function flush() {
    if (curTitle || curContent.some((p) => p.trim())) {
      chapters.push({ title: curTitle || '未命名', content: curContent.join('\n').trim() })
    }
    curTitle = ''
    curContent = []
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue // 空行忽略（段落之间已有换行）

    let numberPrefix = ''
    let isTitle = false
    for (const re of patterns) {
      const m = line.match(re)
      if (m && m.index === 0) {
        const rest = line.slice(m[0].length).trim()
        if (rest.length <= MAX_TITLE_LEN) {
          isTitle = true
          numberPrefix = m[0]
          break
        }
      }
    }

    if (isTitle) {
      flush()
      const rest = line.slice(numberPrefix.length).trim()
      curTitle = settings.keepNumber ? line : rest || numberPrefix.trim() || '未命名'
    } else {
      curContent.push(line)
    }
  }
  flush()
  return chapters
}

interface TxtImportState {
  text: string
  chapters: TxtChapter[] | null
  sel: Set<number>
  settings: TxtImportSettings
  setText: (v: string) => void
  setChapters: (c: TxtChapter[] | null) => void
  setSel: (s: Set<number>) => void
  setSettings: (s: TxtImportSettings) => void
  clear: () => void
}

export const useTxtImport = create<TxtImportState>((set) => ({
  text: '',
  chapters: null,
  sel: new Set(),
  settings: { ...DEFAULT_TXT_SETTINGS },
  setText: (text) => set({ text }),
  setChapters: (chapters) => set({ chapters }),
  setSel: (sel) => set({ sel }),
  setSettings: (settings) => set({ settings }),
  clear: () => set({ text: '', chapters: null, sel: new Set() }),
}))
