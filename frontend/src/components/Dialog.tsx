import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

type DialogRequest =
  | { kind: 'alert'; message: string; resolve: () => void }
  | { kind: 'confirm'; message: string; resolve: (ok: boolean) => void }
  | { kind: 'prompt'; message: string; defaultValue: string; resolve: (value: string | null) => void }

interface DialogApi {
  alert: (message: string) => Promise<void>
  confirm: (message: string) => Promise<boolean>
  prompt: (message: string, defaultValue?: string) => Promise<string | null>
}

const DialogContext = createContext<DialogApi | null>(null)

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useDialog must be used inside <DialogProvider>')
  return ctx
}

const btnCls = 'px-3 py-1.5 rounded-md text-sm font-medium transition-colors'

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogRequest | null>(null)
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!dialog) return
    if (dialog.kind === 'prompt') {
      setInput(dialog.defaultValue)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') ok()
      else if (e.key === 'Escape') cancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog])

  function ok() {
    if (!dialog) return
    setDialog(null)
    if (dialog.kind === 'alert') dialog.resolve()
    else if (dialog.kind === 'confirm') dialog.resolve(true)
    else dialog.resolve(input)
  }

  function cancel() {
    if (!dialog) return
    setDialog(null)
    if (dialog.kind === 'confirm') dialog.resolve(false)
    else if (dialog.kind === 'prompt') dialog.resolve(null)
  }

  const api: DialogApi = {
    alert: (message) => new Promise<void>((resolve) => setDialog({ kind: 'alert', message, resolve })),
    confirm: (message) => new Promise<boolean>((resolve) => setDialog({ kind: 'confirm', message, resolve })),
    prompt: (message, defaultValue = '') =>
      new Promise<string | null>((resolve) => setDialog({ kind: 'prompt', message, defaultValue, resolve })),
  }

  return (
    <DialogContext.Provider value={api}>
      {children}
      {dialog && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40">
          <div className="w-[360px] max-w-[90vw] bg-white dark:bg-gray-800 rounded-xl shadow-xl p-5">
            <div className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap mb-4">{dialog.message}</div>
            {dialog.kind === 'prompt' && (
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 mb-4 bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
            <div className="flex justify-end gap-2">
              {dialog.kind !== 'alert' && (
                <button onClick={cancel} className={`${btnCls} text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700`}>
                  取消
                </button>
              )}
              <button onClick={ok} className={`${btnCls} bg-blue-600 text-white hover:bg-blue-700`}>
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  )
}
