import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { api } from '../api'
import { useStore } from '../store'
import { useSettings } from '../settings'
import type { Beat, Storyline } from '../types'

type PlotData = { label: string; color: string; count: number; beats: Beat[]; expanded: boolean }
type FlowNode = Node<PlotData>

type Menu =
  | { kind: 'node'; x: number; y: number; nodeId: string }
  | { kind: 'edge'; x: number; y: number; edgeId: string }
  | { kind: 'pane'; x: number; y: number }

function PlotNode({ data, selected }: NodeProps<FlowNode>) {
  const beatFontSize = useSettings((s) => s.whiteboardBeatFontSize)
  const multi = data.count > 1
  return (
    <div className="relative">
      <div
        className={`px-3 py-2 rounded-lg bg-white dark:bg-gray-800 shadow-md border-2 min-w-[160px] text-center ${
          selected ? 'ring-2 ring-blue-400' : ''
        }`}
        style={{ borderColor: data.color }}
      >
        <Handle type="target" position={Position.Left} />
        <div className="text-sm text-gray-800 dark:text-gray-200 font-medium">{data.label}</div>
        {multi && <div className="text-[10px] text-purple-600 mt-0.5">交汇 · {data.count} 条线</div>}
        <Handle type="source" position={Position.Right} />
      </div>
      {data.expanded && data.beats.length > 0 && (
        <div
          className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 p-2 text-left space-y-1 z-[100]"
          style={{ fontSize: beatFontSize }}
        >
          {data.beats.map((b, i) => (
            <div key={b.id} className="text-gray-600 dark:text-gray-300 leading-snug">
              <span className="text-gray-400 dark:text-gray-500">{i + 1}.</span> {b.text || '（空）'}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StartNode({ data }: NodeProps<FlowNode>) {
  return (
    <div className="relative">
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium text-white shadow-sm whitespace-nowrap"
        style={{ background: data.color, boxShadow: `0 0 0 3px ${data.color}33` }}
      >
        <span className="w-2 h-2 rounded-full bg-white/90 shrink-0" />
        <span>{data.label}</span>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{ width: 10, height: 10, background: '#fff', border: `2px solid ${data.color}`, right: -5 }}
      />
    </div>
  )
}

const nodeTypes = { plotNode: PlotNode, startNode: StartNode }

export function WhiteboardPage() {
  const nodes = useStore((s) => s.nodes)
  const storylines = useStore((s) => s.storylines)
  const whiteboard = useStore((s) => s.whiteboard)
  const patchStorylines = useStore((s) => s.patchStorylines)
  const patchNodes = useStore((s) => s.patchNodes)
  const patchWhiteboard = useStore((s) => s.patchWhiteboard)
  const setCurrentNodeId = useStore((s) => s.setCurrentNodeId)
  const setActivePage = useStore((s) => s.setActivePage)

  const [activeLineId, setActiveLineId] = useState<string | null>(null)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [clipboard, setClipboard] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [flowNodes, setFlowNodes, onNodesChangeRaw] = useNodesState<FlowNode>([])

  const activeLine = storylines.find((s) => s.id === activeLineId) ?? null

  const nodePos = useMemo(
    () => new Map(whiteboard.filter((w) => w.type === 'node').map((w) => [w.nodeId, w.position])),
    [whiteboard],
  )
  const startPos = useMemo(
    () => new Map(whiteboard.filter((w) => w.type === 'start').map((w) => [w.storylineId, w.position])),
    [whiteboard],
  )

  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Element)) setMenu(null)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [])

  function storylineOf(nodeId: string): Storyline[] {
    return storylines.filter((s) => s.nodes.includes(nodeId))
  }
  function nodeColor(nodeId: string): string {
    const lines = storylineOf(nodeId)
    if (lines.length === 0) return '#000000'
    if (lines.length === 1) return lines[0].color
    return '#7c3aed'
  }

  // sync flow nodes from store (preserve live positions, then stored, then auto)
  useEffect(() => {
    setFlowNodes((current) => {
      const existing = new Map(current.map((n) => [n.id, n]))
      return nodes.map((n, i) => {
        const old = existing.get(n.id)
        return {
          id: n.id,
          type: 'plotNode',
          position: old?.position ?? nodePos.get(n.id) ?? { x: (i % 4) * 230 + 40, y: Math.floor(i / 4) * 160 + 40 },
          data: {
            label: n.title || '未命名节点',
            color: nodeColor(n.id),
            count: storylineOf(n.id).length,
            beats: n.beats ?? [],
            expanded: expandedIds.has(n.id),
          },
        } as FlowNode
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, storylines, expandedIds, whiteboard])

  // one start-dot per storyline, draggable + connectable; name shown on the dot
  const startNodes = useMemo<FlowNode[]>(() => {
    const posById = new Map(flowNodes.map((n) => [n.id, n.position]))
    const result: FlowNode[] = []
    storylines.forEach((sl, idx) => {
      const firstId = sl.nodes.find((id) => posById.has(id))
      if (!firstId) return
      const first = posById.get(firstId)!
      const pos = startPos.get(sl.id) ?? { x: first.x - 110, y: first.y + 6 + idx * 26 }
      result.push({
        id: `start:${sl.id}`,
        type: 'startNode',
        position: pos,
        draggable: true,
        data: { label: sl.name, color: sl.color, count: 0, beats: [], expanded: false },
      })
    })
    return result
  }, [flowNodes, storylines, startPos])

  const edges = useMemo<Edge[]>(() => {
    const existing = new Set(nodes.map((n) => n.id))
    const result: Edge[] = []
    for (const sl of storylines) {
      const ids = sl.nodes.filter((id) => existing.has(id))
      for (let i = 0; i < ids.length - 1; i++) {
        result.push({
          id: `${sl.id}-${ids[i]}-${ids[i + 1]}`,
          source: ids[i],
          target: ids[i + 1],
          animated: true,
          markerEnd: { type: MarkerType.ArrowClosed, color: sl.color },
          data: { lineId: sl.id, source: ids[i], target: ids[i + 1] },
          style: { stroke: sl.color, strokeWidth: 2 },
        })
      }
      if (ids.length) {
        result.push({
          id: `start:${sl.id}:edge`,
          source: `start:${sl.id}`,
          target: ids[0],
          animated: true,
          markerEnd: { type: MarkerType.ArrowClosed, color: sl.color },
          data: { lineId: sl.id, start: true },
          style: { stroke: sl.color, strokeWidth: 2, strokeDasharray: '4 2' },
        })
      }
    }
    return result
  }, [storylines, nodes])

  function onNodesChange(changes: NodeChange<FlowNode>[]) {
    onNodesChangeRaw(changes)
  }

  async function refreshNodes() {
    patchNodes(await api.listNodes())
  }

  async function createNode() {
    const n = await api.createNode()
    await refreshNodes()
    setCurrentNodeId(n.id)
  }

  async function deleteNode(id: string) {
    if (!window.confirm('删除该剧情节点？')) return
    await api.deleteNode(id)
    await refreshNodes()
  }

  async function duplicateNode(id: string) {
    const src = await api.getNode(id)
    const created = await api.createNode()
    await api.updateNode(created.id, { title: (src.meta.title || '未命名节点') + '（副本）', beats: src.meta.beats })
    await refreshNodes()
  }

  async function renameNode(id: string) {
    const n = nodes.find((x) => x.id === id)
    const name = window.prompt('节点标题', n?.title || '')
    if (name === null) return
    await api.updateNode(id, { title: name })
    await refreshNodes()
  }

  function pasteNode() {
    if (!clipboard) {
      window.alert('请先右键某个节点选择「复制」')
      return
    }
    duplicateNode(clipboard)
  }

  function onConnect(conn: Connection) {
    const source = conn.source
    const target = conn.target
    if (!source || !target || !activeLine) return
    if (source.startsWith('start:')) {
      // start dot -> target makes target the first node of the line
      const next = activeLine.nodes.filter((id) => id !== target)
      next.unshift(target)
      saveLine(activeLine.id, { nodes: next })
      return
    }
    const next = [...activeLine.nodes]
    const si = next.indexOf(source)
    const ti = next.indexOf(target)
    if (ti !== -1) next.splice(ti, 1)
    if (si === -1) next.push(source)
    const insertAt = next.indexOf(source) + 1
    next.splice(insertAt, 0, target)
    saveLine(activeLine.id, { nodes: next })
  }

  async function saveLine(id: string, patch: Partial<Storyline>) {
    const line = storylines.find((s) => s.id === id)
    if (!line) return
    const updated = { ...line, ...patch }
    await api.updateStoryline(id, updated)
    const data = await api.getStorylines()
    patchStorylines(data.storylines)
  }

  async function quickGenerateOverallLine() {
    if (nodes.length === 0) {
      window.alert('还没有剧情节点，请先创建节点')
      return
    }
    const orderedIds = [...nodes].sort((a, b) => a.order - b.order).map((n) => n.id)
    const existing = storylines.find((s) => s.name === '总体故事线')
    if (existing) {
      await api.updateStoryline(existing.id, { ...existing, nodes: orderedIds })
      setActiveLineId(existing.id)
    } else {
      const created = await api.createStoryline({ id: '', name: '总体故事线', color: '#4caf50', nodes: orderedIds })
      setActiveLineId(created.id)
    }
    const data = await api.getStorylines()
    patchStorylines(data.storylines)
  }

  async function disconnectEdge(edge: Edge) {
    const d = edge.data as { lineId: string; source?: string; target?: string; start?: boolean } | undefined
    if (!d || d.start || !d.source || !d.target) return
    const line = storylines.find((s) => s.id === d.lineId)
    if (!line) return
    const idx = line.nodes.indexOf(d.source)
    if (idx === -1 || line.nodes[idx + 1] !== d.target) return
    const nodes2 = line.nodes.filter((_, i) => i !== idx + 1)
    await api.updateStoryline(line.id, { ...line, nodes: nodes2 })
    const data = await api.getStorylines()
    patchStorylines(data.storylines)
  }

  function onEdgeDoubleClick(_: unknown, edge: Edge) {
    if (!window.confirm('断开这两个节点的连接？')) return
    disconnectEdge(edge)
  }

  function onEdgesDelete(deleted: Edge[]) {
    const real = deleted.filter((e) => !(e.data as { start?: boolean })?.start)
    if (!real.length) return
    if (!window.confirm(`断开 ${real.length} 条连接？`)) return
    real.forEach((e) => disconnectEdge(e))
  }

  async function changeLineColor(lineId?: string) {
    if (!lineId) return
    const line = storylines.find((s) => s.id === lineId)
    if (!line) return
    const color = window.prompt('连线颜色（hex，例如 #4caf50）', line.color)
    if (color === null) return
    await saveLine(line.id, { color })
  }

  async function addLine() {
    const name = window.prompt('故事线名称', `故事线 ${storylines.length + 1}`)
    if (!name) return
    const color = '#4caf50'
    const created = await api.createStoryline({ id: '', name, color, nodes: [] })
    const data = await api.getStorylines()
    patchStorylines(data.storylines)
    setActiveLineId(created.id)
  }

  async function deleteLine(id: string) {
    if (!window.confirm('删除该故事线？（不影响剧情节点）')) return
    await api.deleteStoryline(id)
    const data = await api.getStorylines()
    patchStorylines(data.storylines)
    if (activeLineId === id) setActiveLineId(null)
  }

  function onNodeClick(_: unknown, node: Node) {
    setCurrentNodeId(node.id)
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(node.id)) next.delete(node.id)
      else next.add(node.id)
      return next
    })
  }

  function onNodeDragStop(_: unknown, node: Node) {
    const position = { x: node.position.x, y: node.position.y }
    if (node.type === 'startNode') {
      const slId = node.id.slice('start:'.length)
      patchWhiteboard([...whiteboard.filter((w) => !(w.type === 'start' && w.storylineId === slId)), { type: 'start', storylineId: slId, position }])
      api.setStartPosition(slId, position).catch(() => {})
    } else {
      patchWhiteboard([...whiteboard.filter((w) => !(w.type === 'node' && w.nodeId === node.id)), { type: 'node', nodeId: node.id, position }])
      api.setNodePosition(node.id, position).catch(() => {})
    }
  }

  const allExpanded = nodes.length > 0 && nodes.every((n) => expandedIds.has(n.id))

  function toggleAllExpanded() {
    setExpandedIds(allExpanded ? new Set() : new Set(nodes.map((n) => n.id)))
  }

  const edgeForMenu = menu?.kind === 'edge' ? edges.find((e) => e.id === menu.edgeId) : undefined

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">故事线白板</h2>
          <div className="flex gap-2">
            <button onClick={createNode} className="px-2.5 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700">
              ＋ 剧情节点
            </button>
            <button onClick={addLine} className="px-2.5 py-1.5 text-xs bg-gray-600 text-white rounded-md hover:bg-gray-700">
              ＋ 故事线
            </button>
            <button onClick={quickGenerateOverallLine} className="px-2.5 py-1.5 text-xs bg-emerald-600 text-white rounded-md hover:bg-emerald-700">
              ⚡ 快速生成总体故事线
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {storylines.map((s) => (
            <div
              key={s.id}
              onClick={() => setActiveLineId(s.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs cursor-pointer border ${
                s.id === activeLineId ? 'bg-gray-100 dark:bg-gray-700 border-gray-400' : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
              <span className="text-gray-700 dark:text-gray-200">{s.name}</span>
              <span className="text-gray-400">{s.nodes.length}</span>
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  deleteLine(s.id)
                }}
                className="text-gray-400 hover:text-red-500"
              >
                ✕
              </span>
            </div>
          ))}
        </div>

        {activeLine && (
          <div className="mt-2 flex items-center gap-3 text-xs">
            <input
              value={activeLine.name}
              onChange={(e) => saveLine(activeLine.id, { name: e.target.value })}
              className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded px-2 py-1 w-36"
            />
            <label className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
              颜色
              <input
                type="color"
                value={activeLine.color}
                onChange={(e) => saveLine(activeLine.id, { color: e.target.value })}
                className="h-6 w-10 border border-gray-300 rounded cursor-pointer"
              />
            </label>
            <span className="text-gray-500 dark:text-gray-400">
              顺序：{activeLine.nodes.map((id) => nodes.find((n) => n.id === id)?.title).filter(Boolean).join(' → ')}
            </span>
          </div>
        )}
        <div className="mt-1.5 text-[11px] text-gray-400">
          {activeLine
            ? '点击节点展开/闭合梗概；从节点右侧拖到另一节点按顺序连接；右键空白/节点/连线有菜单'
            : '点击上方故事线以选择，然后连接节点'}
        </div>
      </div>

      <div className="flex-1 relative">
        <ReactFlow
          nodes={[...flowNodes, ...startNodes]}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onNodeDragStop={onNodeDragStop}
          onEdgeDoubleClick={onEdgeDoubleClick}
          onEdgesDelete={onEdgesDelete}
          deleteKeyCode={['Backspace', 'Delete']}
          onNodeContextMenu={(e, node) => {
            e.preventDefault()
            setMenu({ kind: 'node', x: e.clientX, y: e.clientY, nodeId: node.id })
          }}
          onEdgeContextMenu={(e, edge) => {
            e.preventDefault()
            setMenu({ kind: 'edge', x: e.clientX, y: e.clientY, edgeId: edge.id })
          }}
          onPaneContextMenu={(e) => {
            e.preventDefault()
            setMenu({ kind: 'pane', x: e.clientX, y: e.clientY })
          }}
          onPaneClick={() => setMenu(null)}
          fitView
        >
          <Background gap={20} />
          <Controls position="bottom-right" />
        </ReactFlow>

        <div className="absolute bottom-4 left-4 z-10">
          <button
            onClick={toggleAllExpanded}
            className={`px-3 py-1.5 text-xs rounded-md shadow-md border transition-colors ${
              allExpanded
                ? 'bg-blue-600 text-white border-blue-700 hover:bg-blue-700'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
            title="展开/闭合所有节点的梗概"
          >
            {allExpanded ? '闭合全部梗概' : '展开全部梗概'}
          </button>
        </div>

        {menu && (
          <div
            ref={menuRef}
            className="absolute z-[200] bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 py-1 text-sm"
            style={{ left: menu.x, top: menu.y }}
          >
            {menu.kind === 'pane' && (
              <>
                <button
                  onClick={() => {
                    createNode()
                    setMenu(null)
                  }}
                  className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200"
                >
                  新建节点
                </button>
                <button
                  onClick={() => {
                    pasteNode()
                    setMenu(null)
                  }}
                  className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200"
                >
                  粘贴
                </button>
              </>
            )}
            {menu.kind === 'node' && (
              <>
                <button
                  onClick={() => {
                    setClipboard(menu.nodeId)
                    setMenu(null)
                  }}
                  className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200"
                >
                  复制
                </button>
                <button
                  onClick={() => {
                    renameNode(menu.nodeId)
                    setMenu(null)
                  }}
                  className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200"
                >
                  编辑属性
                </button>
                <button
                  onClick={() => {
                    setCurrentNodeId(menu.nodeId)
                    setActivePage('nodes')
                    setMenu(null)
                  }}
                  className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200"
                >
                  编辑正文
                </button>
                <button
                  onClick={() => {
                    deleteNode(menu.nodeId)
                    setMenu(null)
                  }}
                  className="block w-full text-left px-4 py-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
                >
                  删除
                </button>
              </>
            )}
            {menu.kind === 'edge' && edgeForMenu && (
              <>
                {!(edgeForMenu.data as { start?: boolean })?.start && (
                  <button
                    onClick={() => {
                      disconnectEdge(edgeForMenu)
                      setMenu(null)
                    }}
                    className="block w-full text-left px-4 py-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
                  >
                    删除连线
                  </button>
                )}
                <button
                  onClick={() => {
                    changeLineColor((edgeForMenu.data as { lineId?: string })?.lineId)
                    setMenu(null)
                  }}
                  className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200"
                >
                  修改样式
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
