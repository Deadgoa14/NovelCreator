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
import { useSettings, type WhiteboardDirection } from '../settings'
import { useDialog } from '../components/Dialog'
import type { Beat, Storyline } from '../types'

type PlotData = { label: string; color: string; count: number; beats: Beat[]; expanded: boolean }
type FlowNode = Node<PlotData>

type Menu =
  | { kind: 'node'; x: number; y: number; nodeId: string }
  | { kind: 'edge'; x: number; y: number; edgeId: string }
  | { kind: 'pane'; x: number; y: number }

// Handle normal direction per whiteboard flow direction (source = 出口, target = 入口).
const DIRECTION_SOURCE: Record<WhiteboardDirection, Position> = {
  lr: Position.Right,
  rl: Position.Left,
  tb: Position.Bottom,
  bt: Position.Top,
}
const DIRECTION_TARGET: Record<WhiteboardDirection, Position> = {
  lr: Position.Left,
  rl: Position.Right,
  tb: Position.Top,
  bt: Position.Bottom,
}

function PlotNode({ data, selected, id }: NodeProps<FlowNode>) {
  const beatFontSize = useSettings((s) => s.whiteboardBeatFontSize)
  const direction = useSettings((s) => s.whiteboardDirection)
  const setCurrentNodeId = useStore((s) => s.setCurrentNodeId)
  const setCurrentVolumeId = useStore((s) => s.setCurrentVolumeId)
  const requestFocusBeat = useStore((s) => s.requestFocusBeat)
  const multi = data.count > 1
  const vertical = direction === 'tb' || direction === 'bt'
  return (
    <div className="relative">
      <div
        className={`rounded-lg bg-white dark:bg-gray-800 shadow-md border-2 text-center ${
          vertical ? 'px-2 py-3 w-14' : 'px-3 py-2 min-w-[160px]'
        } ${selected ? 'ring-2 ring-blue-400' : ''}`}
        style={{ borderColor: data.color }}
      >
        <Handle type="target" position={DIRECTION_TARGET[direction]} />
        <div
          className="text-sm text-gray-800 dark:text-gray-200 font-medium"
          style={vertical ? { writingMode: 'vertical-rl', maxHeight: 200 } : undefined}
        >
          {data.label}
        </div>
        {multi && <div className="text-[10px] text-purple-600 mt-0.5">交汇 · {data.count} 条线</div>}
        <Handle type="source" position={DIRECTION_SOURCE[direction]} />
      </div>
      {data.expanded && data.beats.length > 0 && (
        <div
          className={`absolute w-64 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 p-2 text-left space-y-1 z-[100] ${
            vertical ? 'left-full top-1/2 -translate-y-1/2 ml-1' : 'top-full left-1/2 -translate-x-1/2 mt-1'
          }`}
          style={{ fontSize: beatFontSize }}
        >
          {data.beats.map((b, i) => (
            <button
              key={b.id}
              onClick={(e) => {
                e.stopPropagation()
                setCurrentNodeId(id)
                setCurrentVolumeId(null)
                requestFocusBeat(id, b.id)
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="w-full text-left text-gray-600 dark:text-gray-300 leading-snug hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded px-1 py-0.5 break-words"
            >
              <span className="text-gray-400 dark:text-gray-500">{i + 1}.</span> {b.text || '（空）'}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function StartNode({ data }: NodeProps<FlowNode>) {
  const direction = useSettings((s) => s.whiteboardDirection)
  const sourcePos = DIRECTION_SOURCE[direction]
  const offset: React.CSSProperties = {}
  if (sourcePos === Position.Left) offset.left = -7
  else if (sourcePos === Position.Right) offset.right = -7
  else if (sourcePos === Position.Bottom) offset.bottom = -7
  else offset.top = -7
  return (
    <div className="relative cursor-grab active:cursor-grabbing">
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium text-white shadow-sm whitespace-nowrap"
        style={{ background: data.color, boxShadow: `0 0 0 3px ${data.color}33` }}
      >
        <span className="w-2 h-2 rounded-full bg-white/90 shrink-0" />
        <span>{data.label}</span>
      </div>
      <Handle
        type="source"
        position={sourcePos}
        style={{ width: 14, height: 14, background: '#fff', border: `2px solid ${data.color}`, ...offset }}
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
  const direction = useSettings((s) => s.whiteboardDirection)

  const [activeLineId, setActiveLineId] = useState<string | null>(null)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [clipboard, setClipboard] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [flowNodes, setFlowNodes, onNodesChangeRaw] = useNodesState<FlowNode>([])
  const { alert, confirm, prompt } = useDialog()

  // The active storyline: explicit selection wins, otherwise the first storyline.
  const activeLine = storylines.find((s) => s.id === activeLineId) ?? storylines[0] ?? null

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
    // Inactive storylines render black; the active storyline overrides with its color.
    const inActive = activeLine !== null && lines.some((s) => s.id === activeLine.id)
    if (!inActive) return '#000000'
    return lines.length === 1 ? activeLine.color : '#7c3aed'
  }

  // sync flow nodes from store (preserve live positions, then stored, then auto).
  // Start nodes are part of the same controlled list so their drags update live.
  useEffect(() => {
    setFlowNodes((current) => {
      const existing = new Map(current.map((n) => [n.id, n]))
      const plotNodes: FlowNode[] = nodes.map((n, i) => {
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
      const posById = new Map(plotNodes.map((n) => [n.id, n.position]))
      const startNodes: FlowNode[] = storylines.map((sl, idx) => {
        const old = existing.get(`start:${sl.id}`)
        const firstId = sl.nodes.find((id) => posById.has(id))
        const first = firstId ? posById.get(firstId)! : null
        const fallback = first
          ? direction === 'rl'
            ? { x: first.x + 200, y: first.y + 6 + idx * 26 }
            : direction === 'tb'
              ? { x: first.x + 8 + idx * 30, y: first.y - 90 }
              : direction === 'bt'
                ? { x: first.x + 8 + idx * 30, y: first.y + 240 }
                : { x: first.x - 130, y: first.y + 6 + idx * 26 }
          : { x: 40, y: idx * 90 + 40 }
        return {
          id: `start:${sl.id}`,
          type: 'startNode',
          position: old?.position ?? startPos.get(sl.id) ?? fallback,
          draggable: true,
          data: {
            label: sl.name,
            color: sl.id === activeLine?.id ? sl.color : '#000000',
            count: 0,
            beats: [],
            expanded: false,
          },
        } as FlowNode
      })
      return [...plotNodes, ...startNodes]
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, storylines, expandedIds, whiteboard, activeLineId, direction])

  const edges = useMemo<Edge[]>(() => {
    const existing = new Set(nodes.map((n) => n.id))
    const result: Edge[] = []
    for (const sl of storylines) {
      const isActive = sl.id === activeLine?.id
      const stroke = isActive ? sl.color : '#000000'
      if (sl.type === 'branch') {
        for (const be of sl.edges ?? []) {
          if (!existing.has(be.from) || !existing.has(be.to)) continue
          const active = isActive && !!be.active
          const color = active ? sl.color : isActive ? '#9ca3af' : '#000000'
          result.push({
            id: `${sl.id}-${be.from}-${be.to}`,
            source: be.from,
            target: be.to,
            animated: active,
            markerEnd: { type: MarkerType.ArrowClosed, color },
            data: { lineId: sl.id, source: be.from, target: be.to, branch: true },
            style: { stroke: color, strokeWidth: active ? 2 : 1.5 },
          })
        }
        if (sl.start && existing.has(sl.start)) {
          result.push({
            id: `start:${sl.id}:edge`,
            source: `start:${sl.id}`,
            target: sl.start,
            animated: isActive,
            markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
            data: { lineId: sl.id, start: true },
            style: { stroke, strokeWidth: 2, strokeDasharray: '4 2' },
          })
        }
        continue
      }
      const ids = sl.nodes.filter((id) => existing.has(id))
      for (let i = 0; i < ids.length - 1; i++) {
        result.push({
          id: `${sl.id}-${ids[i]}-${ids[i + 1]}`,
          source: ids[i],
          target: ids[i + 1],
          animated: isActive,
          markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
          data: { lineId: sl.id, source: ids[i], target: ids[i + 1] },
          style: { stroke, strokeWidth: 2 },
        })
      }
      if (ids.length) {
        result.push({
          id: `start:${sl.id}:edge`,
          source: `start:${sl.id}`,
          target: ids[0],
          animated: isActive,
          markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
          data: { lineId: sl.id, start: true },
          style: { stroke, strokeWidth: 2, strokeDasharray: '4 2' },
        })
      }
    }
    return result
  }, [storylines, nodes, activeLine])

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
    if (!(await confirm('删除该剧情节点？'))) return
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
    const name = await prompt('节点标题', n?.title || '')
    if (name === null) return
    await api.updateNode(id, { title: name })
    await refreshNodes()
  }

  async function pasteNode() {
    if (!clipboard) {
      await alert('请先右键某个节点选择「复制」')
      return
    }
    duplicateNode(clipboard)
  }

  function onConnect(conn: Connection) {
    const source = conn.source
    const target = conn.target
    if (!source || !target || !activeLine) return
    const line = activeLine
    const isBranch = line.type === 'branch'

    if (source.startsWith('start:')) {
      if (isBranch) {
        const nodes = line.nodes.includes(target) ? [...line.nodes] : [...line.nodes, target]
        saveLine(line.id, { start: target, nodes })
      } else {
        const next = line.nodes.filter((id) => id !== target)
        next.unshift(target)
        saveLine(line.id, { nodes: next })
      }
      return
    }

    if (isBranch) {
      const nodes = line.nodes.includes(source) ? [...line.nodes] : [...line.nodes, source]
      if (!nodes.includes(target)) nodes.push(target)
      const edges = (line.edges ?? []).map((e) => (e.from === source ? { ...e, active: false } : e))
      edges.push({ from: source, to: target, active: true })
      saveLine(line.id, { nodes, edges })
      return
    }

    const next = [...line.nodes]
    const si = next.indexOf(source)
    const ti = next.indexOf(target)
    if (ti !== -1) next.splice(ti, 1)
    if (si === -1) next.push(source)
    const insertAt = next.indexOf(source) + 1
    next.splice(insertAt, 0, target)
    saveLine(line.id, { nodes: next })
  }

  async function saveLine(id: string, patch: Partial<Storyline>) {
    const line = storylines.find((s) => s.id === id)
    if (!line) return
    const updated = { ...line, ...patch }
    await api.updateStoryline(id, updated)
    const data = await api.getStorylines()
    patchStorylines(data.storylines)
  }

  async function changeBranchDirection(edge: Edge) {
    const d = edge.data as { lineId?: string; branch?: boolean } | undefined
    if (!d?.branch) return
    const line = storylines.find((s) => s.id === d.lineId)
    if (!line || line.type !== 'branch') return
    const edges = (line.edges ?? []).map((e) => (e.from === edge.source ? { ...e, active: e.to === edge.target } : e))
    await saveLine(line.id, { edges })
  }

  async function quickGenerateOverallLine() {
    if (nodes.length === 0) {
      await alert('还没有剧情节点，请先创建节点')
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
    const d = edge.data as { lineId: string; source?: string; target?: string; start?: boolean; branch?: boolean } | undefined
    if (!d || d.start || !d.source || !d.target) return
    const line = storylines.find((s) => s.id === d.lineId)
    if (!line) return

    if (line.type === 'branch') {
      const edges = (line.edges ?? []).filter((e) => !(e.from === d.source && e.to === d.target))
      const members = new Set<string>()
      if (line.start) members.add(line.start)
      for (const e of edges) {
        members.add(e.from)
        members.add(e.to)
      }
      await saveLine(line.id, { edges, nodes: Array.from(members) })
      return
    }

    const idx = line.nodes.indexOf(d.source)
    if (idx === -1 || line.nodes[idx + 1] !== d.target) return
    await saveLine(line.id, { nodes: line.nodes.filter((_, i) => i !== idx + 1) })
  }

  async function onEdgeDoubleClick(_: unknown, edge: Edge) {
    if (!(await confirm('断开这两个节点的连接？'))) return
    void disconnectEdge(edge)
  }

  async function onEdgesDelete(deleted: Edge[]) {
    const real = deleted.filter((e) => !(e.data as { start?: boolean })?.start)
    if (!real.length) return
    if (!(await confirm(`断开 ${real.length} 条连接？`))) return
    real.forEach((e) => void disconnectEdge(e))
  }

  async function changeLineColor(lineId?: string) {
    if (!lineId) return
    const line = storylines.find((s) => s.id === lineId)
    if (!line) return
    const color = await prompt('连线颜色（hex，例如 #4caf50）', line.color)
    if (color === null) return
    await saveLine(line.id, { color })
  }

  async function addLine(type: 'single' | 'branch') {
    const label = type === 'branch' ? '可分支故事线' : '单一走向故事线'
    const name = await prompt(`${label}名称`, `故事线 ${storylines.length + 1}`)
    if (!name) return
    const color = '#4caf50'
    const created = await api.createStoryline({ id: '', type, name, color, nodes: [] })
    const data = await api.getStorylines()
    patchStorylines(data.storylines)
    setActiveLineId(created.id)
  }

  async function deleteLine(id: string) {
    if (!(await confirm('删除该故事线？（不影响剧情节点）'))) return
    await api.deleteStoryline(id)
    const data = await api.getStorylines()
    patchStorylines(data.storylines)
    if (activeLineId === id) setActiveLineId(null)
  }

  function onNodeClick(_: unknown, node: Node) {
    if (node.type === 'startNode') {
      // Clicking a storyline's start node switches the active storyline.
      setActiveLineId(node.id.slice('start:'.length))
      return
    }
    if (node.type !== 'plotNode') return
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
  const edgeData = edgeForMenu?.data as { lineId?: string; branch?: boolean; start?: boolean } | undefined
  const canChangeBranch =
    !!edgeData?.branch && activeLine != null && activeLine.type === 'branch' && edgeData.lineId === activeLine.id

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">故事线白板</h2>
          <div className="flex gap-2">
            <button onClick={createNode} className="px-2.5 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700">
              ＋ 剧情节点
            </button>
            <button onClick={() => addLine('single')} className="px-2.5 py-1.5 text-xs bg-gray-600 text-white rounded-md hover:bg-gray-700">
              ＋ 单一走向故事线
            </button>
            <button onClick={() => addLine('branch')} className="px-2.5 py-1.5 text-xs bg-purple-600 text-white rounded-md hover:bg-purple-700">
              ＋ 可分支故事线
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
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs cursor-pointer ${
                s.id === activeLine?.id
                  ? 'flowing-border border border-transparent bg-gray-100 dark:bg-gray-700'
                  : 'border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
              <span className="text-gray-700 dark:text-gray-200">{s.name}</span>
              <span className="text-[10px] px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                {s.type === 'branch' ? '分支' : '单线'}
              </span>
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
            ? activeLine.type === 'branch'
              ? '点击起始节点或上方按钮切换活动故事线；活动线流动、非活动线为黑色；点击节点展开/闭合梗概；右键空白/节点/连线有菜单'
              : '点击起始节点或上方按钮切换活动故事线；活动线流动、非活动线为黑色；从节点右侧拖到另一节点按顺序连接；右键空白/节点/连线有菜单'
            : '请先创建故事线，然后在节点之间建立连线'}
        </div>
      </div>

      <div className="flex-1 relative">
        <ReactFlow
          nodes={flowNodes}
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
                {canChangeBranch && (
                  <button
                    onClick={() => {
                      changeBranchDirection(edgeForMenu)
                      setMenu(null)
                    }}
                    className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200"
                  >
                    改变分支走向
                  </button>
                )}
                {!edgeData?.start && (
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
                    changeLineColor(edgeData?.lineId)
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
