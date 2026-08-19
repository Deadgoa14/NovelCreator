import { useState } from 'react'
import { api, errorMessage } from '../api'
import { useDialog } from './Dialog'

export type ExportKind = 'concepts' | 'characters' | 'outlines'

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function ExportDialog({ kind, onClose }: { kind: ExportKind; onClose: () => void }) {
  const [format, setFormat] = useState<'txt' | 'md'>('txt')
  const [busy, setBusy] = useState(false)
  const { alert } = useDialog()

  async function doExport() {
    setBusy(true)
    try {
      const r = await api.exportData(kind, format)
      download(r.filename, r.content)
      onClose()
    } catch (e) {
      await alert(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40">
      <div className="w-[320px] max-w-[90vw] bg-white dark:bg-gray-800 rounded-xl shadow-xl p-5">
        <div className="text-sm text-gray-800 dark:text-gray-100 mb-4">导出数据</div>
        <div className="mb-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">格式</div>
          <div className="flex rounded-md overflow-hidden border border-gray-300 dark:border-gray-600">
            <button
              onClick={() => setFormat('txt')}
              className={`flex-1 px-3 py-1.5 text-sm ${format === 'txt' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}
            >
              txt
            </button>
            <button
              onClick={() => setFormat('md')}
              className={`flex-1 px-3 py-1.5 text-sm ${format === 'md' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}
            >
              md
            </button>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
            取消
          </button>
          <button onClick={doExport} disabled={busy} className="px-3 py-1.5 rounded-md text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            {busy ? '导出中…' : '导出'}
          </button>
        </div>
      </div>
    </div>
  )
}
