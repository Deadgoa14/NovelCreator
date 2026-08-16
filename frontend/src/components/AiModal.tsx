import { useEffect, useRef, useState } from 'react'

export interface AiModalItem {
  name: string
  description: string
}

interface AiModalProps {
  open: boolean
  busy: boolean
  streaming?: boolean
  mode: 'text' | 'list'
  title: string
  text: string
  items: AiModalItem[]
  confirmLabel: string
  onConfirmText: (text: string) => void
  onConfirmItems: (indices: number[]) => void
  onClose: () => void
}

export function AiModal({
  open,
  busy,
  streaming = false,
  mode,
  title,
  text,
  items,
  confirmLabel,
  onConfirmText,
  onConfirmItems,
  onClose,
}: AiModalProps) {
  const [draftText, setDraftText] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const taRef = useRef<HTMLTextAreaElement | null>(null)

  // Reset local state whenever a new result arrives (open flips to true).
  useEffect(() => {
    if (!open) return
    setDraftText(text)
    setSelected(new Set(items.map((_, i) => i)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, text, items])

  // Auto-scroll to the bottom while streaming text in.
  useEffect(() => {
    if (streaming && taRef.current) {
      taRef.current.scrollTop = taRef.current.scrollHeight
    }
  }, [draftText, streaming])

  if (!open) return null

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === items.length ? new Set() : new Set(items.map((_, i) => i))))
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40">
      <div className="w-[480px] max-w-[92vw] max-h-[80vh] flex flex-col bg-white dark:bg-gray-800 rounded-xl shadow-xl p-5">
        <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
          {title}
          {streaming && <span className="text-xs font-normal text-gray-400">生成中…</span>}
        </div>

        {busy ? (
          <div className="py-10 text-center text-gray-400 text-sm">生成中…</div>
        ) : mode === 'text' ? (
          <textarea
            ref={taRef}
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            readOnly={streaming}
            rows={12}
            className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 dark:text-gray-100 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        ) : (
          <div className="flex-1 overflow-y-auto">
            {items.length === 0 && <div className="py-8 text-center text-gray-400 text-sm">未识别到内容</div>}
            {items.map((it, i) => (
              <label
                key={i}
                className="flex items-start gap-2.5 px-2 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.has(i)}
                  onChange={() => toggle(i)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300"
                />
                <div className="min-w-0">
                  <div className="text-sm text-gray-800 dark:text-gray-100">{it.name}</div>
                  {it.description && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{it.description}</div>
                  )}
                </div>
              </label>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 mt-4">
          {mode === 'list' && !busy && items.length > 0 ? (
            <button
              onClick={toggleAll}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600"
            >
              {selected.size === items.length ? '取消全选' : '全选'}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-md text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              取消
            </button>
            <button
              disabled={busy || streaming || (mode === 'list' && selected.size === 0)}
              onClick={() => (mode === 'text' ? onConfirmText(draftText) : onConfirmItems([...selected].sort((a, b) => a - b)))}
              className="px-4 py-1.5 rounded-md text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
