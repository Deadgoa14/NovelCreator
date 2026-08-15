import { useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { useStore } from '../store'
import { uid } from '../util'
import type { Beat, Volume } from '../types'

type ListItem =
  | { kind: 'node'; id: string; order: number; title: string; beatCount: number; characterCount: number }
  | { kind: 'volume'; id: string; order: number; name: string }

export function NodesPage() {
  const nodes = useStore((s) => s.nodes)
  const volumes = useStore((s) => s.volumes)
  const currentNodeId = useStore((s) => s.currentNodeId)
  const currentNode = useStore((s) => s.currentNode)
  const currentVolumeId = useStore((s) => s.currentVolumeId)
  const setCurrentNodeId = useStore((s) => s.setCurrentNodeId)
  const setCurrentVolumeId = useStore((s) => s.setCurrentVolumeId)
  const patchCurrentNode = useStore((s) => s.patchCurrentNode)
  const patchNodes = useStore((s) => s.patchNodes)
  const patchVolumes = useStore((s) => s.patchVolumes)

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<{ title?: string; beats?: Beat[] }>({})
  const volTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const volPendingRef = useRef<Partial<Volume>>({})
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const title = currentNode?.title ?? ''
  const beats = currentNode?.beats ?? []
  const selectedVolume = volumes.find((v) => v.id === currentVolumeId) ?? null

  const items = useMemo<ListItem[]>(() => {
    const list: ListItem[] = [
      ...nodes.map((n) => ({
        kind: 'node' as const,
        id: n.id,
        order: n.order,
        title: n.title,
        beatCount: n.beatCount,
        characterCount: n.characterCount,
      })),
      ...volumes.map((v) => ({ kind: 'volume' as const, id: v.id, order: v.order, name: v.name })),
    ]
    list.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    return list
  }, [nodes, volumes])

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

  async function deleteNode(id: string) {
    if (!window.confirm('删除该剧情节点？正文不可恢复。')) return
    await api.deleteNode(id)
    const list = await api.listNodes()
    patchNodes(list)
    if (currentNodeId === id) setCurrentNodeId(list[0]?.id ?? null)
  }

  async function deleteVolume(id: string) {
    if (!window.confirm('删除该卷？（不影响其下的剧情节点）')) return
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

  function scheduleSave(patch: { title?: string; beats?: Beat[] }) {
    pendingRef.current = { ...pendingRef.current, ...patch }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      const p = pendingRef.current
      pendingRef.current = {}
      if (!currentNodeId) return
      await api.updateNode(currentNodeId, p)
      refreshNodes()
    }, 500)
  }

  function scheduleVolumeSave(patch: Partial<Volume>) {
    if (!currentVolumeId) return
    volPendingRef.current = { ...volPendingRef.current, ...patch }
    patchVolumes(volumes.map((v) => (v.id === currentVolumeId ? { ...v, ...patch } : v)))
    if (volTimerRef.current) clearTimeout(volTimerRef.current)
    volTimerRef.current = setTimeout(async () => {
      const p = volPendingRef.current
      volPendingRef.current = {}
      await api.updateVolume(currentVolumeId, p)
      patchVolumes(await api.listVolumes())
    }, 500)
  }

  function onTitleChange(v: string) {
    patchCurrentNode({ title: v })
    scheduleSave({ title: v })
  }

  function onBeatChange(index: number, patch: Partial<Beat>) {
    const next = beats.map((b, i) => (i === index ? { ...b, ...patch } : b))
    patchCurrentNode({ beats: next })
    scheduleSave({ beats: next })
  }

  function addBeat() {
    const next = [...beats, { id: uid('beat'), text: '', body: '' }]
    patchCurrentNode({ beats: next })
    scheduleSave({ beats: next })
  }

  function removeBeat(index: number) {
    const next = beats.filter((_, i) => i !== index)
    patchCurrentNode({ beats: next })
    scheduleSave({ beats: next })
  }

  function toggleCollapse(id: string) {
    setCollapsed((c) => ({ ...c, [id]: !c[id] }))
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">剧情节点 / 卷</h2>
        <div className="flex gap-2">
          <button
            onClick={createNode}
            className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            ＋ 新建节点
          </button>
          <button
            onClick={createVolume}
            className="px-3 py-1.5 text-xs bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            ＋ 新建卷
          </button>
        </div>
      </div>

      <div className="max-h-[40%] overflow-y-auto border-b border-gray-200">
        {items.length === 0 && <div className="p-6 text-center text-gray-400 text-sm">暂无节点</div>}
        {items.map((it, i) => {
          if (it.kind === 'node') {
            return (
              <div
                key={it.id}
                onClick={() => {
                  setCurrentNodeId(it.id)
                  setCurrentVolumeId(null)
                }}
                className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer border-l-2 transition-colors ${
                  it.id === currentNodeId && !currentVolumeId
                    ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-500'
                    : 'border-transparent hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <span className="text-xs text-gray-400 dark:text-gray-500 w-5 text-right shrink-0">{it.order}</span>
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
              <span className="text-xs text-gray-400 dark:text-gray-500 w-5 text-right shrink-0">{it.order}</span>
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

      <div className="flex-1 overflow-y-auto">
        {selectedVolume ? (
          <div className="p-3 space-y-3">
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">卷（分隔符，导出时只在其第一个章节前插入一次卷名 + 卷正文）</div>
            <label className="block">
              <span className="text-xs text-gray-500 dark:text-gray-400">卷名</span>
              <input
                value={selectedVolume.name}
                onChange={(e) => scheduleVolumeSave({ name: e.target.value })}
                placeholder="例如：流放之路"
                className="w-full text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500 dark:text-gray-400">介绍（仅预览显示，不导出）</span>
              <textarea
                value={selectedVolume.intro ?? ''}
                onChange={(e) => scheduleVolumeSave({ intro: e.target.value })}
                rows={2}
                placeholder="例如：主角的童年"
                className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500 dark:text-gray-400">正文（引子，导出；换行即分段）</span>
              <textarea
                value={selectedVolume.body ?? ''}
                onChange={(e) => scheduleVolumeSave({ body: e.target.value })}
                rows={6}
                placeholder="例如：一首诗、一段引子…"
                className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </label>
          </div>
        ) : (
          <div className="p-3">
            <input
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="节点标题"
              className="w-full text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 mb-3 bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400">剧情梗概（每条梗概下方填写对应正文）</h3>
              <button onClick={addBeat} className="text-xs text-blue-600 hover:text-blue-700">
                ＋ 添加条目
              </button>
            </div>

            {beats.length === 0 && <div className="text-center text-gray-400 text-xs py-6">暂无梗概条目</div>}

            {beats.map((b, i) => {
              const isCollapsed = !!collapsed[b.id]
              const bodyLong = (b.body ?? '').length > 120
              return (
                <div key={b.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg mb-3 overflow-hidden shadow-sm">
                  <div className="flex items-start gap-2 p-2.5">
                    <span className="text-xs text-gray-400 w-4 text-right leading-9 shrink-0">{i + 1}.</span>
                    <textarea
                      value={b.text}
                      onChange={(e) => onBeatChange(i, { text: e.target.value })}
                      rows={2}
                      placeholder="简述这段剧情…"
                      className="flex-1 text-sm bg-gray-100 dark:bg-gray-700 dark:text-gray-100 border border-gray-200 dark:border-gray-600 rounded-md px-2.5 py-1.5 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 hover:border-gray-300"
                    />
                    <button
                      onClick={() => removeBeat(i)}
                      className="opacity-0 hover:opacity-100 text-gray-400 hover:text-red-500 text-xs shrink-0"
                      title="删除条目"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="px-2.5 pb-2.5 pl-[30px]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-gray-400">正文</span>
                      {bodyLong && (
                        <button onClick={() => toggleCollapse(b.id)} className="text-[11px] text-blue-500 hover:text-blue-600">
                          {isCollapsed ? '展开' : '收起'}
                        </button>
                      )}
                    </div>
                    <textarea
                      value={b.body ?? ''}
                      onChange={(e) => onBeatChange(i, { body: e.target.value })}
                      rows={isCollapsed ? 2 : 6}
                      placeholder="在这里写对应正文，换行即分段…"
                      className="w-full text-sm bg-slate-200/70 dark:bg-gray-600/70 dark:text-gray-100 border border-gray-300 dark:border-gray-600 border-l-4 border-l-blue-400 rounded-md px-2.5 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
