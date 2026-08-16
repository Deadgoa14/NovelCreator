import { useMemo, useState } from 'react'
import { api, errorMessage } from '../api'
import { useStore } from '../store'
import { useSettings } from '../settings'
import { useDialog } from '../components/Dialog'
import { uid } from '../util'
import type { Beat } from '../types'

type ListItem =
  | { kind: 'node'; id: string; order: number; title: string; beatCount: number; characterCount: number; beats: Beat[]; indented: boolean; chapterNumber: number }
  | { kind: 'volume'; id: string; order: number; name: string }

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
  const [showChapterNumber, setShowChapterNumber] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const { confirm, alert } = useDialog()

  const items = useMemo<ListItem[]>(() => {
    const list: ListItem[] = [
      ...nodes.map((n) => ({
        kind: 'node' as const,
        id: n.id,
        order: n.order,
        title: n.title,
        beatCount: n.beatCount,
        characterCount: n.characterCount,
        beats: n.beats ?? [],
        indented: false,
        chapterNumber: 0,
      })),
      ...volumes.map((v) => ({ kind: 'volume' as const, id: v.id, order: v.order, name: v.name })),
    ]
    list.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    // Nodes after a volume (until the next volume) are indented under it; also
    // compute the chapter number (volumes don't count, optional per-volume reset).
    let insideVolume = false
    let chapter = 0
    for (const it of list) {
      if (it.kind === 'volume') {
        insideVolume = true
        if (chapterNumberingPerVolume) chapter = 0
      } else {
        it.indented = insideVolume
        chapter += 1
        it.chapterNumber = chapter
      }
    }
    return list
  }, [nodes, volumes, chapterNumberingPerVolume])

  async function refreshNodes() {
    patchNodes(await api.listNodes())
  }

  async function createNode() {
    const n = await api.createNode()
    await refreshNodes()
    setCurrentNodeId(n.id)
    setCurrentVolumeId(null)
  }

  async function createVolume() {
    const v = await api.createVolume()
    patchVolumes(await api.listVolumes())
    setCurrentVolumeId(v.id)
    setCurrentNodeId(null)
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
    await api.deleteNode(id)
    const list = await api.listNodes()
    patchNodes(list)
    if (currentNodeId === id) setCurrentNodeId(list[0]?.id ?? null)
  }

  async function deleteVolume(id: string) {
    if (!(await confirm('删除该卷？（不影响其下的剧情节点）'))) return
    await api.deleteVolume(id)
    patchVolumes(await api.listVolumes())
    if (currentVolumeId === id) setCurrentVolumeId(null)
  }

  async function moveItem(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= items.length) return
    const next = [...items]
    const [it] = next.splice(index, 1)
    next.splice(target, 0, it)
    const result = await api.reorderItems(next.map((x) => ({ type: x.kind, id: x.id })))
    patchNodes(result.nodes)
    patchVolumes(result.volumes)
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">剧情节点 / 卷</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowChapterNumber((v) => !v)}
            title={showChapterNumber ? '切换为显示 order' : '切换为显示章节数'}
            className={`px-3 py-1.5 text-xs rounded-md border ${
              showChapterNumber
                ? 'bg-blue-600 text-white border-blue-700 hover:bg-blue-700'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600'
            }`}
          >
            {showChapterNumber ? '章节数' : 'order'}
          </button>
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
          <button
            onClick={createVolume}
            className="px-3 py-1.5 text-xs bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            ＋ 新建卷
          </button>
        </div>
      </div>

      <div className="px-3 py-1.5 border-b border-gray-200 dark:border-gray-700 text-[11px] text-gray-400">
        点击条目在右侧编辑
      </div>

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 && <div className="p-6 text-center text-gray-400 text-sm">暂无节点</div>}
        {items.map((it, i) => {
          if (it.kind === 'node') {
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
                    <div className="text-sm text-gray-800 dark:text-gray-200 truncate">{it.title || '未命名节点'}</div>
                    <div className="text-[11px] text-gray-400 dark:text-gray-500">
                      {it.beatCount} 条梗概 · {it.characterCount} 人物
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        moveItem(i, -1)
                      }}
                      disabled={i === 0}
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
                      disabled={i === items.length - 1}
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
                      <button
                        key={b.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          setCurrentNodeId(it.id)
                          setCurrentVolumeId(null)
                          requestFocusBeat(it.id, b.id)
                        }}
                        className="w-full text-left text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-gray-600 dark:text-gray-300"
                        title={b.text || `梗概 ${bi + 1}`}
                      >
                        <span className="text-gray-400 dark:text-gray-500 mr-1.5">{bi + 1}.</span>
                        <span className="break-words">{b.text || '（空）'}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          }
          return (
            <div
              key={it.id}
              onClick={() => {
                setCurrentVolumeId(it.id)
                setCurrentNodeId(null)
              }}
              className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer border-l-2 transition-colors ${
                it.id === currentVolumeId
                  ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-500'
                  : 'border-transparent hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <span className="text-xs text-gray-400 dark:text-gray-500 w-5 text-right shrink-0">{showChapterNumber ? '' : it.order}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 shrink-0">
                卷
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{it.name || '未命名卷'}</div>
              </div>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    moveItem(i, -1)
                  }}
                  disabled={i === 0}
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
                  disabled={i === items.length - 1}
                  className="text-gray-400 hover:text-blue-600 disabled:opacity-30 text-xs px-1"
                  title="下移"
                >
                  ↓
                </button>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  deleteVolume(it.id)
                }}
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-xs px-1"
                title="删除"
              >
                ✕
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
