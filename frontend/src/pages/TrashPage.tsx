import { useEffect, useState } from 'react'
import { api } from '../api'
import { useStore } from '../store'
import { useDialog } from '../components/Dialog'
import type { TrashEntry } from '../types'

export function TrashPage() {
  const [entries, setEntries] = useState<TrashEntry[]>([])
  const nodes = useStore((s) => s.nodes)
  const setCurrentNodeId = useStore((s) => s.setCurrentNodeId)
  const setCurrentVolumeId = useStore((s) => s.setCurrentVolumeId)
  const requestFocusBeat = useStore((s) => s.requestFocusBeat)
  const patchNodes = useStore((s) => s.patchNodes)
  const patchCurrentNode = useStore((s) => s.patchCurrentNode)
  const { confirm, alert } = useDialog()

  async function refresh() {
    setEntries((await api.getTrash()).trash)
  }

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 2000)
    return () => clearInterval(id)
  }, [])

  const nodeTitle = (id: string) => nodes.find((n) => n.id === id)?.title || '（章节已删除）'

  async function restore(e: TrashEntry) {
    if (e.nodeId) {
      try {
        const n = await api.getNode(e.nodeId)
        const beats = [...(n.meta.beats ?? [])]
        const idx = beats.findIndex((b) => b.id === e.beatId)
        if (idx === -1) {
          await alert('原梗概条目已不存在，无法还原')
          return
        }
        const b = beats[idx]
        beats[idx] = { ...b, body: (b.body ? b.body + '\n' : '') + e.text }
        await api.updateNode(e.nodeId, { beats })
        patchNodes(await api.listNodes())
        if (useStore.getState().currentNodeId === e.nodeId) {
          patchCurrentNode({ beats })
        }
        setCurrentNodeId(e.nodeId)
        setCurrentVolumeId(null)
        requestFocusBeat(e.nodeId, e.beatId)
      } catch {
        await alert('还原失败')
        return
      }
    }
    await api.deleteTrash(e.id)
    await refresh()
  }

  async function removeOne(id: string) {
    await api.deleteTrash(id)
    await refresh()
  }

  async function clearAll() {
    if (!(await confirm('清空废纸篓？这些文本将无法恢复。'))) return
    await api.clearTrash()
    await refresh()
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">废纸篓</h2>
        <button
          onClick={clearAll}
          disabled={entries.length === 0}
          className="px-2.5 py-1.5 text-xs text-red-600 border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-40 dark:border-red-800 dark:hover:bg-red-900/30"
        >
          清空废纸篓
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {entries.length === 0 && <div className="p-6 text-center text-gray-400 text-sm">废纸篓为空</div>}
        {entries.map((e) => (
          <div key={e.id} className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-blue-600 dark:text-blue-300">{nodeTitle(e.nodeId)}</span>
              <span className="text-[11px] text-gray-400">{e.createdAt.slice(0, 19).replace('T', ' ')}</span>
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap line-clamp-4 mb-2">{e.text}</div>
            <div className="flex gap-2">
              <button onClick={() => restore(e)} className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded">
                还原
              </button>
              <button onClick={() => removeOne(e.id)} className="px-2 py-1 text-xs text-gray-400 hover:text-red-500 rounded">
                删除
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
