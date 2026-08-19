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
import { api, errorMessage } from '../api'
import { useStore } from '../store'
import { useSettings, type WhiteboardDirection } from '../settings'
import { useDialog } from '../components/Dialog'
import type { Beat, Point, Storyline, Volume } from '../types'

type PlotData = { label: string; color: string; count: number; beats: Beat[]; expanded: boolean; chapters?: { id: string; title: string }[] }
type FlowNode = Node<PlotData>

type Menu =
  | { kind: 'node'; x: number; y: number; nodeId: string; nodeType: string }
  | { kind: 'edge'; x: number; y: number; edgeId: string }
  | { kind: 'pane'; x: number; y: number }

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

// Graph ids: node ids ("node-…"), volume ids ("volume-…"), or storyline ids ("line-…" = 线头).
function isVolumeRef(id: string): boolean {
  return id.startsWith('volume-')
}
function volIdOf(nodeId: string): string | null {
  if (nodeId.endsWith(':start') || nodeId.endsWith(':end')) return nodeId.slice(0, nodeId.lastIndexOf(':'))
  if (isVolumeRef(nodeId)) return nodeId
  return null
}
function isTerminal(nodeId: string): boolean {
  return nodeId.endsWith(':start') || nodeId.endsWith(':end')
}

function volStartOffset(pos: Point, direction: WhiteboardDirection): Point {
  switch (direction) {
    case 'rl':
      return { x: pos.x + 220, y: pos.y + 6 }
    case 'tb':
      return { x: pos.x + 8, y: pos.y - 90 }
    case 'bt':
      return { x: pos.x + 8, y: pos.y + 240 }
    default:
      return { x: pos.x - 150, y: pos.y + 6 }
  }
}
function volEndOffset(pos: Point, direction: WhiteboardDirection): Point {
  switch (direction) {
    case 'rl':
      return { x: pos.x - 150, y: pos.y + 6 }
    case 'tb':
      return { x: pos.x + 8, y: pos.y + 240 }
    case 'bt':
      return { x: pos.x + 8, y: pos.y - 90 }
    default:
      return { x: pos.x + 220, y: pos.y + 6 }
  }
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

function VolTerminalNode({ data }: NodeProps<FlowNode>) {
  const direction = useSettings((s) => s.whiteboardDirection)
  return (
    <div className="relative">
      <Handle type="target" position={DIRECTION_TARGET[direction]} />
      <div
        className="px-3 py-1.5 rounded-full text-[11px] font-medium text-white whitespace-nowrap shadow-sm border-2 border-dashed border-amber-300"
        style={{ background: data.color }}
      >
        {data.label}
      </div>
      <Handle type="source" position={DIRECTION_SOURCE[direction]} />
    </div>
  )
}

function VolNode({ data, selected, id }: NodeProps<FlowNode>) {
  const direction = useSettings((s) => s.whiteboardDirection)
  const setCurrentNodeId = useStore((s) => s.setCurrentNodeId)
  const setCurrentVolumeId = useStore((s) => s.setCurrentVolumeId)
  const vertical = direction === 'tb' || direction === 'bt'
  return (
    <div className="relative">
      <div
        className={`rounded-lg bg-amber-50 dark:bg-amber-900/40 shadow-md border-2 text-center px-4 py-3 ${
          vertical ? 'w-16' : 'min-w-[170px]'
        } ${selected ? 'ring-2 ring-amber-400' : ''}`}
        style={{ borderColor: data.color }}
      >
        <Handle type="target" position={DIRECTION_TARGET[direction]} />
        <div className="text-sm font-semibold text-amber-800 dark:text-amber-200">{data.label}</div>
        <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">卷 · {data.count} 章</div>
        <Handle type="source" position={DIRECTION_SOURCE[direction]} />
      </div>
      {data.expanded && (data.chapters?.length ?? 0) > 0 && (
        <div
          className={`absolute w-64 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 p-2 text-left space-y-1 z-[100] ${
            vertical ? 'left-full top-1/2 -translate-y-1/2 ml-1' : 'top-full left-1/2 -translate-x-1/2 mt-1'
          }`}
        >
          {data.chapters!.map((ch, i) => (
            <button
              key={ch.id}
              onClick={(e) => {
                e.stopPropagation()
                setCurrentNodeId(ch.id)
                setCurrentVolumeId(null)
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="w-full text-left text-gray-600 dark:text-gray-300 leading-snug hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded px-1 py-0.5 break-words"
            >
              <span className="text-gray-400 dark:text-gray-500">{i + 1}.</span> {ch.title || '（未命名）'}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const nodeTypes = { plotNode: PlotNode, startNode: StartNode, volNode: VolNode, volStartNode: VolTerminalNode, volEndNode: VolTerminalNode }

export function WhiteboardPage() {
  const nodes = useStore((s) => s.nodes)
  const storylines = useStore((s) => s.storylines)
  const volumes = useStore((s) => s.volumes)
  const connections = useStore((s) => s.connections)
  const whiteboard = useStore((s) => s.whiteboard)
  const patchStorylines = useStore((s) => s.patchStorylines)
  const patchNodes = useStore((s) => s.patchNodes)
  const patchVolumes = useStore((s) => s.patchVolumes)
  const patchConnections = useStore((s) => s.patchConnections)
  const patchWhiteboard = useStore((s) => s.patchWhiteboard)
  const setCurrentNodeId = useStore((s) => s.setCurrentNodeId)
  const setCurrentVolumeId = useStore((s) => s.setCurrentVolumeId)
  const setActivePage = useStore((s) => s.setActivePage)
  const direction = useSettings((s) => s.whiteboardDirection)
  const plotNodeColor = useSettings((s) => s.plotNodeColor)
  const volumeNodeColor = useSettings((s) => s.volumeNodeColor)

  const [activeLineId, setActiveLineId] = useState<string | null>(null)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [clipboard, setClipboard] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [collapsedVolumes, setCollapsedVolumes] = useState<Set<string>>(new Set())
  const [flowNodes, setFlowNodes, onNodesChangeRaw] = useNodesState<FlowNode>([])
  const { alert, confirm, prompt } = useDialog()

  const activeLine = storylines.find((s) => s.id === activeLineId) ?? storylines[0] ?? null

  const nodePos = useMemo(() => new Map(whiteboard.filter((w) => w.type === 'node').map((w) => [w.nodeId, w.position])), [whiteboard])
  const startPos = useMemo(() => new Map(whiteboard.filter((w) => w.type === 'start').map((w) => [w.storylineId, w.position])), [whiteboard])
  const volumePos = useMemo(() => new Map(whiteboard.filter((w) => w.type === 'volume').map((w) => [w.volumeId, w.position])), [whiteboard])
  const volumeStartPos = useMemo(() => new Map(whiteboard.filter((w) => w.type === 'volumeStart').map((w) => [w.volumeId, w.position])), [whiteboard])
  const volumeEndPos = useMemo(() => new Map(whiteboard.filter((w) => w.type === 'volumeEnd').map((w) => [w.volumeId, w.position])), [whiteboard])

  const volById = useMemo(() => new Map(volumes.map((v) => [v.id, v])), [volumes])

  // For each storyline (线头), follow active connections to get its chain of steps.
  const chainByLine = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const sl of storylines) {
      const steps: string[] = []
      let cur: string | null = sl.id
      const seen = new Set<string>()
      while (cur && !seen.has(cur)) {
        seen.add(cur)
        if (cur !== sl.id) steps.push(cur)
        const out = connections.find((c) => c.from === cur && c.active)
        cur = out ? out.to : null
      }
      m.set(sl.id, steps)
    }
    return m
  }, [storylines, connections])

  const activeChainEdgeIds = useMemo(() => {
    if (!activeLine) return new Set<string>()
    const edges = new Set<string>()
    let cur: string | null = activeLine.id
    const seen = new Set<string>()
    while (cur && !seen.has(cur)) {
      seen.add(cur)
      const out = connections.find((c) => c.from === cur && c.active)
      if (!out) break
      edges.add(out.id)
      cur = out.to
    }
    return edges
  }, [connections, activeLine])

  const activeChainSteps = activeLine ? chainByLine.get(activeLine.id) ?? [] : []

  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Element)) setMenu(null)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [])

  function storylineOf(nodeId: string): Storyline[] {
    return storylines.filter((s) => chainByLine.get(s.id)?.includes(nodeId))
  }
  function nodeColor(nodeId: string): string {
    const lines = storylineOf(nodeId)
    if (lines.length === 0) return plotNodeColor
    const inActive = activeLine !== null && lines.some((s) => s.id === activeLine.id)
    if (!inActive) return plotNodeColor
    return lines.length === 1 ? activeLine.color : '#7c3aed'
  }

  useEffect(() => {
    setFlowNodes((current) => {
      const existing = new Map(current.map((n) => [n.id, n]))
      const hidden = new Set<string>()
      for (const v of volumes) {
        if (collapsedVolumes.has(v.id)) for (const c of v.chapters ?? []) hidden.add(c)
      }

      const plotNodes: FlowNode[] = nodes
        .filter((n) => !hidden.has(n.id))
        .map((n, i) => {
          const old = existing.get(n.id)
          return {
            id: n.id,
            type: 'plotNode',
            position: old?.position ?? nodePos.get(n.id) ?? { x: (i % 4) * 230 + 40, y: Math.floor(i / 4) * 160 + 40 },
            data: { label: n.title || '未命名节点', color: nodeColor(n.id), count: storylineOf(n.id).length, beats: n.beats ?? [], expanded: expandedIds.has(n.id) },
          } as FlowNode
        })
      const posById = new Map(plotNodes.map((n) => [n.id, n.position]))

      const volumeNodes: FlowNode[] = []
      for (const vol of volumes) {
        const chPos = (c: string) => posById.get(c) ?? nodePos.get(c) ?? existing.get(c)?.position
        const positions = (vol.chapters ?? []).map((c) => chPos(c)).filter((p): p is Point => !!p)
        const first = positions[0] ?? null
        const last = positions[positions.length - 1] ?? null
        const totalChapters = (vol.chapters ?? []).length
        const stored = volumePos.get(vol.id)
        const chapterTitles = (vol.chapters ?? [])
          .map((cid) => nodes.find((n) => n.id === cid))
          .filter(Boolean)
          .map((n) => ({ id: n!.id, title: n!.title }))
        if (collapsedVolumes.has(vol.id)) {
          volumeNodes.push({
            id: vol.id,
            type: 'volNode',
            position: existing.get(vol.id)?.position ?? stored ?? first ?? { x: 40, y: 40 },
            draggable: true,
            data: { label: vol.name || '未命名卷', color: volumeNodeColor, count: totalChapters, beats: [], expanded: expandedIds.has(vol.id), chapters: chapterTitles },
          } as FlowNode)
        } else {
          volumeNodes.push(
            {
              id: vol.id + ':start',
              type: 'volStartNode',
              position: existing.get(vol.id + ':start')?.position ?? volumeStartPos.get(vol.id) ?? (first ? volStartOffset(first, direction) : stored ?? { x: 40, y: 40 }),
              draggable: true,
              data: { label: `${vol.name || '未命名卷'}（起始）`, color: volumeNodeColor, count: totalChapters, beats: [], expanded: false },
            } as FlowNode,
            {
              id: vol.id + ':end',
              type: 'volEndNode',
              position: existing.get(vol.id + ':end')?.position ?? volumeEndPos.get(vol.id) ?? (last ? volEndOffset(last, direction) : { x: 40, y: 80 }),
              draggable: true,
              data: { label: `${vol.name || '未命名卷'}（完）`, color: volumeNodeColor, count: totalChapters, beats: [], expanded: false },
            } as FlowNode,
          )
        }
      }

      const startNodes: FlowNode[] = storylines.map((sl, idx) => {
        const old = existing.get(sl.id)
        const firstStep = chainByLine.get(sl.id)?.[0]
        const firstPos = firstStep ? posById.get(firstStep) ?? nodePos.get(firstStep) ?? volumePos.get(firstStep) : null
        const fallback = firstPos
          ? direction === 'rl'
            ? { x: firstPos.x + 200, y: firstPos.y + 6 + idx * 26 }
            : direction === 'tb'
              ? { x: firstPos.x + 8 + idx * 30, y: firstPos.y - 90 }
              : direction === 'bt'
                ? { x: firstPos.x + 8 + idx * 30, y: firstPos.y + 240 }
                : { x: firstPos.x - 130, y: firstPos.y + 6 + idx * 26 }
          : { x: 40, y: idx * 90 + 40 }
        return {
          id: sl.id,
          type: 'startNode',
          position: old?.position ?? startPos.get(sl.id) ?? fallback,
          draggable: true,
          data: { label: sl.name, color: sl.id === activeLine?.id ? sl.color : '#000000', count: 0, beats: [], expanded: false },
        } as FlowNode
      })
      return [...plotNodes, ...volumeNodes, ...startNodes]
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, storylines, expandedIds, whiteboard, activeLineId, direction, volumes, collapsedVolumes, connections])

  const edges = useMemo<Edge[]>(() => {
    const nodeExists = new Set(nodes.map((n) => n.id))
    const lineIds = new Set(storylines.map((s) => s.id))
    const valid = (id: string) => nodeExists.has(id) || isVolumeRef(id) || lineIds.has(id)
    const result: Edge[] = []

    // Connections.
    for (const c of connections) {
      if (!valid(c.from) || !valid(c.to)) continue
      const srcExpanded = isVolumeRef(c.from) && !collapsedVolumes.has(c.from)
      const tgtExpanded = isVolumeRef(c.to) && !collapsedVolumes.has(c.to)
      const source = isVolumeRef(c.from) ? (srcExpanded ? c.from + ':end' : c.from) : c.from
      const target = isVolumeRef(c.to) ? (tgtExpanded ? c.to + ':start' : c.to) : c.to
      const onActive = activeLine != null && activeChainEdgeIds.has(c.id)
      const stroke = onActive ? activeLine.color : '#000000'
      result.push({
        id: c.id,
        source,
        target,
        animated: onActive,
        markerEnd: { type: MarkerType.ArrowClosed, color: c.active ? stroke : '#9ca3af' },
        data: { connId: c.id, from: c.from, to: c.to, active: c.active, onActive },
        style: {
          stroke: c.active ? stroke : '#9ca3af',
          strokeWidth: c.active ? 2 : 1.5,
          ...(c.active ? {} : { strokeDasharray: '4 4' }),
        },
      })
    }

    // Volume internal chains (expanded volumes): colored if on the active chain, else black.
    for (const vol of volumes) {
      if (collapsedVolumes.has(vol.id)) continue
      const ch = (vol.chapters ?? []).filter((c) => nodeExists.has(c))
      if (!ch.length) continue
      const onActive = activeLine != null && activeChainSteps.includes(vol.id)
      const stroke = onActive ? activeLine.color : '#000000'
      const seq = [vol.id + ':start', ...ch, vol.id + ':end']
      for (let i = 0; i < seq.length - 1; i++) {
        result.push({
          id: `${vol.id}-int-${i}`,
          source: seq[i],
          target: seq[i + 1],
          animated: onActive,
          markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
          data: { containment: true, source: seq[i], target: seq[i + 1] },
          style: { stroke, strokeWidth: 2, ...(onActive ? {} : { strokeDasharray: '6 3' }) },
        })
      }
    }
    return result
  }, [connections, volumes, storylines, nodes, activeLine, activeChainEdgeIds, activeChainSteps, collapsedVolumes])

  function onNodesChange(changes: NodeChange<FlowNode>[]) {
    onNodesChangeRaw(changes)
  }

  async function refreshNodes() {
    patchNodes(await api.listNodes())
  }
  async function refreshVolumes() {
    patchVolumes(await api.listVolumes())
  }
  async function refreshConnections() {
    patchConnections((await api.getConnections()).connections)
  }

  async function createNode() {
    const n = await api.createNode()
    await refreshNodes()
    setCurrentNodeId(n.id)
  }

  async function deleteNode(id: string) {
    if (!(await confirm('删除该剧情节点？'))) return
    try {
      await api.deleteNode(id)
      await refreshNodes()
      await refreshVolumes()
      await refreshConnections()
    } catch (e) {
      await alert('删除失败：' + errorMessage(e))
      await refreshNodes().catch(() => {})
    }
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

  async function addVolume() {
    const name = await prompt('卷名称', `卷 ${volumes.length + 1}`)
    if (!name) return
    await api.createVolume(name)
    await refreshVolumes()
  }

  async function renameVolume(volId: string) {
    const v = volumes.find((x) => x.id === volId)
    const name = await prompt('卷名称', v?.name || '')
    if (name === null) return
    await api.updateVolume(volId, { name })
    await refreshVolumes()
  }

  async function deleteVolume(volId: string) {
    if (!(await confirm('删除该卷？（不影响其下的剧情节点）'))) return
    await api.deleteVolume(volId)
    await refreshVolumes()
    await refreshConnections()
    setCollapsedVolumes((prev) => {
      const next = new Set(prev)
      next.delete(volId)
      return next
    })
  }

  async function archiveToVolume(nodeId: string, volId: string) {
    const vol = volumes.find((v) => v.id === volId)
    if (!vol) return
    for (const v2 of volumes) {
      if (v2.id !== volId && (v2.chapters ?? []).includes(nodeId)) {
        await api.setVolumeChapters(v2.id, (v2.chapters ?? []).filter((c) => c !== nodeId))
      }
    }
    const chapters = [...(vol.chapters ?? [])]
    if (!chapters.includes(nodeId)) chapters.push(nodeId)
    await api.setVolumeChapters(volId, chapters)
    await refreshVolumes()
  }

  async function removeFromVolume(nodeId: string) {
    const vol = volumes.find((v) => (v.chapters ?? []).includes(nodeId))
    if (!vol) return
    await api.setVolumeChapters(vol.id, (vol.chapters ?? []).filter((c) => c !== nodeId))
    await refreshVolumes()
  }

  async function addConnection(from: string, to: string) {
    try {
      await api.createConnection(from, to)
      await refreshConnections()
    } catch (e) {
      await alert(errorMessage(e))
    }
  }
  async function switchBranch(connId: string) {
    await api.setConnectionActive(connId)
    await refreshConnections()
  }
  async function removeConnection(connId: string) {
    await api.deleteConnection(connId)
    await refreshConnections()
  }

  function onConnect(conn: Connection) {
    const source = conn.source
    const target = conn.target
    if (!source || !target) return

    if (isTerminal(source) || isTerminal(target)) {
      const volId = volIdOf(isTerminal(source) ? source : target)
      const chapterId = isTerminal(source) ? target : source
      if (volId && chapterId && !isTerminal(chapterId) && !isVolumeRef(chapterId)) {
        void archiveToVolume(chapterId, volId)
      }
      return
    }
    void addConnection(source, target)
  }

  async function quickGenerateOverallLine() {
    if (nodes.length === 0) {
      await alert('还没有剧情节点，请先创建节点')
      return
    }
    const orderedIds = [...nodes].sort((a, b) => a.order - b.order).map((n) => n.id)
    let lineId = storylines.find((s) => s.name === '总体故事线')?.id
    if (!lineId) {
      const created = await api.createStoryline({ id: '', name: '总体故事线', color: '#4caf50' })
      lineId = created.id
      const data = await api.getStorylines()
      patchStorylines(data.storylines)
    }
    await api.createConnection(lineId, orderedIds[0])
    for (let i = 0; i < orderedIds.length - 1; i++) {
      await api.createConnection(orderedIds[i], orderedIds[i + 1])
    }
    await refreshConnections()
    setActiveLineId(lineId)
  }

  async function addLine() {
    const name = await prompt('故事线名称', `故事线 ${storylines.length + 1}`)
    if (!name) return
    const created = await api.createStoryline({ id: '', name, color: '#4caf50' })
    const data = await api.getStorylines()
    patchStorylines(data.storylines)
    setActiveLineId(created.id)
  }

  async function deleteLine(id: string) {
    if (!(await confirm('删除该故事线？（不影响节点与连线）'))) return
    await api.deleteStoryline(id)
    const data = await api.getStorylines()
    patchStorylines(data.storylines)
    if (activeLineId === id) setActiveLineId(null)
  }

  async function saveLine(id: string, patch: Partial<Storyline>) {
    const line = storylines.find((s) => s.id === id)
    if (!line) return
    await api.updateStoryline(id, { ...line, ...patch })
    const data = await api.getStorylines()
    patchStorylines(data.storylines)
  }

  function onNodeClick(_: unknown, node: Node) {
    if (node.type === 'startNode') {
      setActiveLineId(node.id)
      return
    }
    if (node.type === 'volNode') {
      const volId = volIdOf(node.id)
      if (volId) {
        setExpandedIds((prev) => {
          const next = new Set(prev)
          if (next.has(node.id)) next.delete(node.id)
          else next.add(node.id)
          return next
        })
      }
      return
    }
    if (node.type === 'volStartNode') {
      const volId = volIdOf(node.id)
      if (volId) {
        setCurrentVolumeId(volId)
        setCurrentNodeId(null)
      }
      return
    }
    if (node.type !== 'plotNode') return
    setCurrentNodeId(node.id)
    setCurrentVolumeId(null)
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
      patchWhiteboard([...whiteboard.filter((w) => !(w.type === 'start' && w.storylineId === node.id)), { type: 'start', storylineId: node.id, position }])
      api.setStartPosition(node.id, position).catch(() => {})
    } else if (node.type === 'volNode') {
      const volId = volIdOf(node.id)
      if (volId) {
        patchWhiteboard([...whiteboard.filter((w) => !(w.type === 'volume' && w.volumeId === volId)), { type: 'volume', volumeId: volId, position }])
        api.setVolumePosition(volId, position).catch(() => {})
      }
    } else if (node.type === 'volStartNode' || node.type === 'volEndNode') {
      const volId = volIdOf(node.id)
      if (volId) {
        const terminal = node.type === 'volStartNode' ? 'start' : 'end'
        const key = node.type === 'volStartNode' ? 'volumeStart' : 'volumeEnd'
        patchWhiteboard([...whiteboard.filter((w) => !(w.type === key && w.volumeId === volId)), { type: key, volumeId: volId, position }])
        api.setVolumeTerminalPosition(volId, terminal, position).catch(() => {})
      }
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
  const edgeData = edgeForMenu?.data as { connId?: string; from?: string; to?: string; active?: boolean; onActive?: boolean; containment?: boolean; source?: string; target?: string } | undefined
  const canSwitch = !!edgeData?.connId && (connections.filter((c) => c.from === edgeData.from).length > 1)
  const containmentTarget = edgeData?.containment && edgeData.target && !isTerminal(edgeData.target) ? edgeData.target : null
  const containmentTitle = containmentTarget ? nodes.find((n) => n.id === containmentTarget)?.title : null
  const nodeVolOfMenu = menu?.kind === 'node' ? volumes.find((v) => (v.chapters ?? []).includes(menu.nodeId)) : undefined
  const menuVolId = menu?.kind === 'node' ? volIdOf(menu.nodeId) : null

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">故事线白板</h2>
          <div className="flex gap-2 flex-wrap">
            <button onClick={createNode} className="px-2.5 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700">＋ 剧情节点</button>
            <button onClick={addVolume} className="px-2.5 py-1.5 text-xs bg-amber-600 text-white rounded-md hover:bg-amber-700">＋ 新建卷</button>
            <button onClick={addLine} className="px-2.5 py-1.5 text-xs bg-gray-600 text-white rounded-md hover:bg-gray-700">＋ 故事线</button>
            <button onClick={quickGenerateOverallLine} className="px-2.5 py-1.5 text-xs bg-emerald-600 text-white rounded-md hover:bg-emerald-700">⚡ 快速生成总体故事线</button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {storylines.map((s) => (
            <div
              key={s.id}
              onClick={() => setActiveLineId(s.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs cursor-pointer ${
                s.id === activeLine?.id ? 'flowing-border border border-transparent bg-gray-100 dark:bg-gray-700' : 'border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
              <span className="text-gray-700 dark:text-gray-200">{s.name}</span>
              <span className="text-gray-400">{chainByLine.get(s.id)?.length ?? 0}</span>
              <span onClick={(e) => { e.stopPropagation(); deleteLine(s.id) }} className="text-gray-400 hover:text-red-500">✕</span>
            </div>
          ))}
        </div>

        {activeLine && (
          <div className="mt-2 flex items-center gap-3 text-xs">
            <input value={activeLine.name} onChange={(e) => saveLine(activeLine.id, { name: e.target.value })} className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded px-2 py-1 w-36" />
            <label className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
              颜色
              <input type="color" value={activeLine.color} onChange={(e) => saveLine(activeLine.id, { color: e.target.value })} className="h-6 w-10 border border-gray-300 rounded cursor-pointer" />
            </label>
            <span className="text-gray-500 dark:text-gray-400">执行链：{activeChainSteps.map((id) => volById.get(id)?.name ?? nodes.find((n) => n.id === id)?.title ?? id).filter(Boolean).join(' → ') || '（空，从线头拖线到章节开始）'}</span>
          </div>
        )}
        <div className="mt-1.5 text-[11px] text-gray-400">
          从「出」拖到「入」建立「A 在 B 之前」约束；从线头拖到章节开始一条故事线；彩色流动=当前生效的执行链；右键连线可切换分支/断开。
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
          onEdgeDoubleClick={(_, edge) => {
            const d = edge.data as { connId?: string }
            if (d?.connId) void removeConnection(d.connId)
          }}
          onEdgesDelete={() => {}}
          deleteKeyCode={['Backspace', 'Delete']}
          onNodeContextMenu={(e, node) => {
            e.preventDefault()
            setMenu({ kind: 'node', x: e.clientX, y: e.clientY, nodeId: node.id, nodeType: node.type ?? '' })
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
              allExpanded ? 'bg-blue-600 text-white border-blue-700 hover:bg-blue-700' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
            title="展开/闭合所有节点的梗概"
          >
            {allExpanded ? '闭合全部梗概' : '展开全部梗概'}
          </button>
        </div>

        {menu && (
          <div ref={menuRef} className="absolute z-[200] bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 py-1 text-sm" style={{ left: menu.x, top: menu.y }}>
            {menu.kind === 'pane' && (
              <>
                <button onClick={() => { createNode(); setMenu(null) }} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200">新建节点</button>
                <button onClick={() => { addVolume(); setMenu(null) }} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200">新建卷</button>
                <button onClick={() => { pasteNode(); setMenu(null) }} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200">粘贴</button>
              </>
            )}
            {menu.kind === 'node' && menu.nodeType === 'plotNode' && (
              <>
                <button onClick={() => { setClipboard(menu.nodeId); setMenu(null) }} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200">复制</button>
                <button onClick={() => { renameNode(menu.nodeId); setMenu(null) }} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200">编辑属性</button>
                <button onClick={() => { setCurrentNodeId(menu.nodeId); setActivePage('nodes'); setMenu(null) }} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200">编辑正文</button>
                {volumes.length > 0 && (
                  <div className="border-t border-gray-200 dark:border-gray-700 mt-1 pt-1">
                    {volumes.map((v) => (
                      <button key={v.id} onClick={() => { archiveToVolume(menu.nodeId, v.id); setMenu(null) }} className="block w-full text-left px-4 py-1.5 hover:bg-amber-50 dark:hover:bg-amber-900/30 text-amber-700 dark:text-amber-300">归档到「{v.name || '未命名卷'}」</button>
                    ))}
                  </div>
                )}
                {nodeVolOfMenu && (
                  <button onClick={() => { removeFromVolume(menu.nodeId); setMenu(null) }} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200">移出「{nodeVolOfMenu.name || '未命名卷'}」</button>
                )}
                <button onClick={() => { deleteNode(menu.nodeId); setMenu(null) }} className="block w-full text-left px-4 py-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30">删除</button>
              </>
            )}
            {menu.kind === 'node' && menu.nodeType === 'volNode' && menuVolId && (
              <>
                <button onClick={() => { setCollapsedVolumes((prev) => { const n = new Set(prev); n.delete(menuVolId!); return n }); setMenu(null) }} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200">展开卷</button>
                <button onClick={() => { renameVolume(menuVolId!); setMenu(null) }} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200">编辑卷名</button>
                <button onClick={() => { deleteVolume(menuVolId!); setMenu(null) }} className="block w-full text-left px-4 py-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30">删除卷</button>
              </>
            )}
            {menu.kind === 'node' && (menu.nodeType === 'volStartNode' || menu.nodeType === 'volEndNode') && menuVolId && (
              <button onClick={() => { setCollapsedVolumes((prev) => new Set(prev).add(menuVolId!)); setMenu(null) }} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200">收起卷</button>
            )}
            {menu.kind === 'node' && menu.nodeType === 'startNode' && (
              <button onClick={() => { deleteLine(menu.nodeId); setMenu(null) }} className="block w-full text-left px-4 py-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30">删除故事线</button>
            )}
            {menu.kind === 'edge' && edgeForMenu && edgeData && (
              <>
                {edgeData.containment ? (
                  containmentTarget ? (
                    <button onClick={() => { removeFromVolume(containmentTarget); setMenu(null) }} className="block w-full text-left px-4 py-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30">删除连线（移出「{containmentTitle || '章节'}」）</button>
                  ) : (
                    <span className="block w-full text-left px-4 py-1.5 text-gray-400 dark:text-gray-500">卷边界</span>
                  )
                ) : (
                  <>
                    {canSwitch && (
                      <button onClick={() => { switchBranch(edgeData.connId!); setMenu(null) }} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200">切换分支</button>
                    )}
                    <button onClick={() => { removeConnection(edgeData.connId!); setMenu(null) }} className="block w-full text-left px-4 py-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30">断开连线</button>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
