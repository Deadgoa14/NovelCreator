import { useMemo, useState } from 'react'
import { api, errorMessage } from '../api'
import { useStore } from '../store'
import { useSettings } from '../settings'
import { useDialog } from '../components/Dialog'
import { ExportDialog } from '../components/ExportDialog'
import { uid } from '../util'
import type { Beat, Volume } from '../types'

type Row =
  | { kind: 'node'; id: string; order: number; title: string; beatCount: number; characterCount: number; beats: Beat[]; indented: boolean; chapterNumber: number }
  | { kind: 'volOpen'; id: string; name: string }
  | { kind: 'volClose'; id: string; name: string }

export function NodesPage() {
  const nodes = useStore((s) => s.nodes)
  const volumes = useStore((s) => s.volumes)
  const currentNodeId = useStore((s) => s.currentNodeId)
  const currentVolumeId = useStore((s) => s.currentVolumeId)
  const setCurrentNodeId = useStore((s) => s.setCurrentNodeId)
  const setCurrentVolumeId = useStore((s) => s.setCurrentVolumeId)
  const requestFocusBeat = useStore((s) => s.requestFocusBeat)
  const patchNodes = useStore((s) => s.patchNodes)
  const patchVolumes = useStore((s) => s.patchVolumes)
  const patchCurrentNode = useStore((s) => s.patchCurrentNode)
  const chapterNumberingPerVolume = useSettings((s) => s.chapterNumberingPerVolume)
  const showChapterNumber = useSettings((s) => s.showChapterNumber)
  const [aiBusy, setAiBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const { confirm, alert } = useDialog()

  // Nodes ordered by ``order``, with volume separators inserted at membership
  // boundaries. A volume's position is derived from its first chapter, so it
  // carries no order of its own. A search query filters to matching nodes.
  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase()
    let sorted = [...nodes].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    if (q) {
      sorted = sorted.filter(
        (n) =>
          (n.title || '').toLowerCase().includes(q) ||
          (n.beats ?? []).some((b) => (b.text || '').toLowerCase().includes(q)),
      )
    }
    const volByNode = new Map<string, Volume>()
    for (const v of volumes) {
      for (const c of v.chapters ?? []) {
        if (!volByNode.has(c)) volByNode.set(c, v)
      }
    }
    const rows: Row[] = []
    let prevVol: Volume | null = null
    let chapter = 0
    for (const n of sorted) {
      const vol = volByNode.get(n.id) ?? null
      if (vol !== prevVol) {
        if (prevVol) rows.push({ kind: 'volClose', id: prevVol.id, name: prevVol.name })
        if (vol) {
          rows.push({ kind: 'volOpen', id: vol.id, name: vol.name })
          if (chapterNumberingPerVolume) chapter = 0
        }
        prevVol = vol
      }
      chapter += 1
      rows.push({
        kind: 'node',
        id: n.id,
        order: n.order,
        title: n.title,
        beatCount: n.beatCount,
        characterCount: n.characterCount,
        beats: n.beats ?? [],
        indented: !!vol,
        chapterNumber: chapter,
      })
    }
    if (prevVol) rows.push({ kind: 'volClose', id: prevVol.id, name: prevVol.name })
    return rows
  }, [nodes, volumes, chapterNumberingPerVolume, query])

  async function refreshNodes() {
    patchNodes(await api.listNodes())
  }

  async function createNode() {
    const n = await api.createNode()
    await refreshNodes()
    setCurrentNodeId(n.id)
    setCurrentVolumeId(null)
  }

  async function continueBeat() {
    if (!currentNodeId) {
      await alert('请先选择一个剧情节点')
      return
    }
    setAiBusy(true)
    try {
      const r = await api.aiBeat(currentNodeId)
      const text = (r.text || '').trim()
      if (!text) {
        await alert('未生成梗概，请重试')
        return
      }
      const n = await api.getNode(currentNodeId)
      const next = [...(n.meta.beats ?? []), { id: uid('beat'), text, body: '' }]
      await api.updateNode(currentNodeId, { beats: next })
      patchNodes(await api.listNodes())
      if (useStore.getState().currentNodeId === currentNodeId) {
        patchCurrentNode({ beats: next })
      }
    } catch (e) {
      await alert(errorMessage(e))
    } finally {
      setAiBusy(false)
    }
  }

  async function deleteNode(id: string) {
    if (!(await confirm('删除该剧情节点？正文不可恢复。'))) return
    try {
      await api.deleteNode(id)
      const list = await api.listNodes()
      patchNodes(list)
      if (currentNodeId === id) setCurrentNodeId(list[0]?.id ?? null)
    } catch (e) {
      await alert('删除失败：' + errorMessage(e))
      patchNodes(await api.listNodes().catch(() => []))
    }
  }

  async function deleteVolume(id: string) {
    if (!(await confirm('删除该卷？（不影响其下的剧情节点）'))) return
    await api.deleteVolume(id)
    patchVolumes(await api.listVolumes())
    if (currentVolumeId === id) setCurrentVolumeId(null)
  }

  async function deleteBeat(nodeId: string, beatId: string) {
    if (!(await confirm('删除该梗概条目？其正文不可恢复。'))) return
    try {
      const n = await api.getNode(nodeId)
      const next = (n.meta.beats ?? []).filter((b) => b.id !== beatId)
      await api.updateNode(nodeId, { beats: next })
      patchNodes(await api.listNodes())
      if (useStore.getState().currentNodeId === nodeId) {
        patchCurrentNode({ beats: next })
      }
    } catch (e) {
      await alert('删除失败：' + errorMessage(e))
    }
  }

  async function moveItem(rowIndex: number, dir: -1 | 1) {
    const row = rows[rowIndex]
    if (!row || row.kind !== 'node') return
    const sorted = [...nodes].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    const pos = sorted.findIndex((n) => n.id === row.id)
    const target = pos + dir
    if (target < 0 || target >= sorted.length) return
    const next = [...sorted]
    const [it] = next.splice(pos, 1)
    next.splice(target, 0, it)
    patchNodes(await api.reorderNodes(next.map((n) => n.id)))
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">章节目录 / 卷</h2>
        <div className="flex gap-2">
          <button
            onClick={createNode}
            className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            ＋ 新建节点
          </button>
          <button
            onClick={continueBeat}
            disabled={aiBusy}
            className="px-3 py-1.5 text-xs bg-violet-600 text-white rounded-md hover:bg-violet-700 disabled:opacity-50"
            title="根据当前节点的已有梗概，AI 续写一条新梗概"
          >
            ✨ 在当前梗概下AI续写梗概
          </button>
          <button onClick={() => setExportOpen(true)} className="px-3 py-1.5 text-xs bg-gray-600 text-white rounded-md hover:bg-gray-700">
            导出
          </button>
        </div>
      </div>

      <div className="px-3 py-1.5 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索章节（标题 / 梗概）…"
          className="flex-1 text-xs border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {query && (
          <button onClick={() => setQuery('')} className="text-xs text-gray-400 hover:text-gray-600">
            清除
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 && <div className="p-6 text-center text-gray-400 text-sm">暂无节点</div>}
        {rows.map((it, i) => {
          if (it.kind === 'volOpen') {
            return (
              <div
                key={'vo' + it.id}
                onClick={() => {
                  setCurrentVolumeId(it.id)
                  setCurrentNodeId(null)
                }}
                className={`relative group text-center px-3 py-2 cursor-pointer border-t border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-900/20 ${
                  it.id === currentVolumeId ? 'ring-1 ring-inset ring-amber-400' : ''
                }`}
              >
                <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                  ──── 卷 · {it.name || '未命名卷'} ────
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteVolume(it.id)
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-xs px-1"
                  title="删除卷"
                >
                  ✕
                </button>
              </div>
            )
          }
          if (it.kind === 'volClose') {
            return (
              <div key={'vc' + it.id} className="text-center text-[11px] text-amber-400/80 dark:text-amber-600 py-1">
                ──── {it.name || '未命名卷'}（完）────
              </div>
            )
          }
          return (
            <div
              key={it.id}
              className={`border-l-2 transition-colors ${it.indented ? 'ml-6' : ''} ${
                it.id === currentNodeId && !currentVolumeId
                  ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-500'
                  : 'border-transparent hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <div
                onClick={() => {
                  setCurrentNodeId(it.id)
                  setCurrentVolumeId(null)
                }}
                className="group flex items-center gap-2 px-3 py-2.5 cursor-pointer"
              >
                <span className="text-xs text-gray-400 dark:text-gray-500 w-5 text-right shrink-0">{showChapterNumber ? it.chapterNumber : it.order}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-800 dark:text-gray-200 truncate">{it.title || '未命名节点'}</span>
                    {it.beatCount === 0 && (
                      <span className="text-[10px] px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 shrink-0">
                        空
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-400 dark:text-gray-500">
                    {it.beatCount} 条梗概 · {it.characterCount} 人物
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      moveItem(i, -1)
                    }}
                    className="text-gray-400 hover:text-blue-600 disabled:opacity-30 text-xs px-1"
                    title="上移"
                  >
                    ↑
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      moveItem(i, 1)
                    }}
                    className="text-gray-400 hover:text-blue-600 disabled:opacity-30 text-xs px-1"
                    title="下移"
                  >
                    ↓
                  </button>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteNode(it.id)
                  }}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-xs px-1"
                  title="删除"
                >
                  ✕
                </button>
              </div>

              {it.beats.length > 0 && (
                <div className="pl-10 pr-3 pb-2.5 space-y-1">
                  {it.beats.map((b, bi) => (
                    <div
                      key={b.id}
                      className="group/beat flex items-center gap-1 rounded bg-gray-100 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setCurrentNodeId(it.id)
                          setCurrentVolumeId(null)
                          requestFocusBeat(it.id, b.id)
                        }}
                        className="flex-1 text-left text-xs px-2 py-1 text-gray-600 dark:text-gray-300"
                        title={b.text || `梗概 ${bi + 1}`}
                      >
                        <span className="text-gray-400 dark:text-gray-500 mr-1.5">{bi + 1}.</span>
                        <span className="break-words">{b.text || '（空）'}</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteBeat(it.id, b.id)
                        }}
                        className="opacity-0 group-hover/beat:opacity-100 text-gray-400 hover:text-red-500 text-xs px-1.5 shrink-0"
                        title="删除梗概"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {exportOpen && <ExportDialog kind="outlines" onClose={() => setExportOpen(false)} />}
    </div>
  )
}
