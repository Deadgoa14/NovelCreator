import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { diff_match_patch } from 'diff-match-patch'

const dmp = new diff_match_patch()

type DiffOp = -1 | 0 | 1
type DiffMode = 'char' | 'line'

function computeDiffs(oldText: string, newText: string, mode: DiffMode): [DiffOp, string][] {
  if (mode === 'line') {
    // Line-level (git style): map each line to a single char, diff, then map back.
    const a = dmp.diff_linesToChars_(oldText, newText)
    const diffs = dmp.diff_main(a.chars1, a.chars2, false)
    dmp.diff_charsToLines_(diffs, a.lineArray)
    dmp.diff_cleanupSemantic(diffs)
    return diffs as [DiffOp, string][]
  }
  // Char-level: diff the raw strings, then merge adjacent edits into readable blocks.
  const diffs = dmp.diff_main(oldText, newText)
  dmp.diff_cleanupSemantic(diffs)
  return diffs as [DiffOp, string][]
}

const CHAR_DEL = 'bg-red-100 text-red-700 line-through decoration-red-400 dark:bg-red-900/40 dark:text-red-300'
const CHAR_INS = 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
const LINE_DEL = 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
const LINE_INS = 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'

export function DiffView({ oldText, newText }: { oldText: string; newText: string }) {
  const [mode, setMode] = useState<DiffMode>('char')
  const diffs = useMemo(() => computeDiffs(oldText, newText, mode), [oldText, newText, mode])

  const btn = (m: DiffMode, label: string) => (
    <button
      onClick={() => setMode(m)}
      className={`px-1.5 py-0.5 text-[10px] rounded ${
        mode === m ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
      }`}
    >
      {label}
    </button>
  )

  let body: ReactNode
  if (mode === 'char') {
    body = (
      <div className="whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-700 dark:text-gray-200">
        {diffs.map(([op, text], i) => {
          if (op === 0) return <span key={i}>{text}</span>
          return (
            <span key={i} className={op === -1 ? CHAR_DEL : CHAR_INS}>
              {text}
            </span>
          )
        })}
      </div>
    )
  } else {
    body = (
      <div className="text-xs leading-relaxed text-gray-700 dark:text-gray-200">
        {diffs.map(([op, text], ci) => {
          const parts = text.split('\n')
          // Drop only the trailing '' produced by a trailing newline.
          if (parts.length > 1 && parts[parts.length - 1] === '') parts.pop()
          return parts.map((line, li) => (
            <div
              key={`${ci}-${li}`}
              className={`px-1 rounded-sm min-h-[1.2em] ${
                op === -1 ? LINE_DEL : op === 1 ? LINE_INS : ''
              }`}
            >
              {line || ' '}
            </div>
          ))
        })}
      </div>
    )
  }

  return (
    <div className="mt-1.5 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="flex items-center justify-between px-2 py-1 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <span className="text-[10px] text-gray-400">红 = 原句删除 · 绿 = 润色新增</span>
        <div className="flex gap-1">
          {btn('char', '字级')}
          {btn('line', '行级')}
        </div>
      </div>
      <div className="p-2 max-h-[240px] overflow-y-auto">{body}</div>
    </div>
  )
}
