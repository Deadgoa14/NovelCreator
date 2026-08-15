import { useEffect, useMemo, useState } from 'react'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { api, errorMessage } from '../api'
import { useStore } from '../store'
import { useDialog } from '../components/Dialog'
import type { Concept } from '../types'

const inputCls =
  'w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100'

type Menu =
  | { kind: 'node'; x: number; y: number; nodeId: string }
  | { kind: 'edge'; x: number; y: number; edgeId: string }
  | { kind: 'pane'; x: number; y: number }

// 8 handle positions around a 120×120 circle (cardinal + 4 diagonals).
const HANDLE_SPOTS: { id: string; top: string; left: string }[] = [
  { id: 'top', top: '0%', left: '50%' },
  { id: 'right', top: '50%', left: '100%' },
  { id: 'bottom', top: '100%', left: '50%' },
  { id: 'left', top: '50%', left: '0%' },
  { id: 'tl', top: '14.6%', left: '14.6%' },
  { id: 'tr', top: '14.6%', left: '85.4%' },
  { id: 'bl', top: '85.4%', left: '14.6%' },
  { id: 'br', top: '85.4%', left: '85.4%' },
]

function CharacterNode({ data }: NodeProps) {
  const d = data as { label: string; color: string }
  return (
    <div className="relative" style={{ width: 120, height: 120 }}>
      <div
        className="w-full h-full rounded-full flex items-center justify-center text-center px-3 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100"
        style={{ border: `2px solid ${d.color}`, fontSize: 14 }}
      >
        <span className="leading-tight break-words">{d.label}</span>
      </div>
      {HANDLE_SPOTS.map((h) => (
        <Handle
          key={h.id}
          id={h.id}
          type="source"
          position={Position.Top}
          style={{ top: h.top, left: h.left, transform: 'translate(-50%, -50%)' }}
        />
      ))}
      {HANDLE_SPOTS.map((h) => (
        <Handle
          key={`${h.id}-t`}
          id={`${h.id}-t`}
          type="target"
          position={Position.Top}
          style={{ top: h.top, left: h.left, transform: 'translate(-50%, -50%)', width: 24, height: 24, opacity: 0 }}
        />
      ))}
    </div>
  )
}

const nodeTypes = { character: CharacterNode }

export function RelationsPage() {
  const concepts = useStore((s) => s.concepts)
  const relations = useStore((s) => s.relations)
  const nodes = useStore((s) => s.nodes)
  const relationsBoard = useStore((s) => s.relationsBoard)
  const patchConcepts = useStore((s) => s.patchConcepts)
  const patchRelationsBoard = useStore((s) => s.patchRelationsBoard)
  const setCurrentNodeId = useStore((s) => s.setCurrentNodeId)
  const setActivePage = useStore((s) => s.setActivePage)

  const characters = useMemo(() => concepts.filter((c) => c.type === 'character'), [concepts])
  const charPos = useMemo(
    () => new Map(relationsBoard.map((b) => [b.conceptId, b.position])),
    [relationsBoard],
  )

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Concept | null>(null)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [clipboard, setClipboard] = useState<string | null>(null)
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<Node>([])
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<Edge>([])
  const { alert, confirm, prompt } = useDialog()

  const selected = characters.find((c) => c.id === selectedId) ?? null

  useEffect(() => {
    setFlowNodes((current) => {
      const existing = new Map(current.map((n) => [n.id, n]))
      return characters.map((c, i) => ({
        id: c.id,
        type: 'character',
        position: existing.get(c.id)?.position ?? charPos.get(c.id) ?? { x: (i % 4) * 190 + 40, y: Math.floor(i / 4) * 150 + 40 },
        data: { label: c.name, color: c.color },
      }))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characters, charPos])

  useEffect(() => {
    setFlowEdges(
      relations
        .filter((r) => characters.some((c) => c.id === r.from) && characters.some((c) => c.id === r.to))
        .map((r, i) => ({
          id: `${r.from}-${r.to}-${i}`,
          source: r.from,
          target: r.to,
          label: r.label,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: '#6b7280', strokeWidth: 1.5 },
          labelStyle: { fill: '#374151', fontSize: 11 },
          labelBgStyle: { fill: '#ffffff', fillOpacity: 0.92 },
        })),
    )
  }, [relations, characters])

  async function refresh() {
    const data = await api.getConcepts()
    patchConcepts(data.concepts, data.relations)
  }

  async function onConnect(conn: Connection) {
    if (!conn.source || !conn.target) return
    const label = await prompt('关系（显示在连线上）', '')
    if (label === null) return
    const next = [...relations, { from: conn.source, to: conn.target, label }]
    await api.saveRelations(next)
    await refresh()
  }

  function findRelation(edge: Edge) {
    return relations.find((r) => r.from === edge.source && r.to === edge.target)
  }

  async function onEdgeDoubleClick(_: unknown, edge: Edge) {
    const rel = findRelation(edge)
    if (!rel) return
    const label = await prompt('编辑关系（留空则删除）', rel.label)
    if (label === null) return
    const next =
      label.trim() === ''
        ? relations.filter((r) => !(r.from === rel.from && r.to === rel.to && r.label === rel.label))
        : relations.map((r) =>
            r.from === rel.from && r.to === rel.to && r.label === rel.label ? { ...r, label } : r,
          )
    await api.saveRelations(next)
    await refresh()
  }

  async function removeRelation(edge: Edge) {
    const rel = findRelation(edge)
    if (!rel) return
    await api.saveRelations(relations.filter((r) => !(r.from === rel.from && r.to === rel.to)))
    await refresh()
  }

  function onNodeClick(_: unknown, node: Node) {
    setSelectedId(node.id)
    const c = characters.find((x) => x.id === node.id)
    if (c) setDraft({ ...c })
  }

  async function deleteCharacter(id: string) {
    if (!(await confirm('删除该人物概念？'))) return
    await api.deleteConcept(id)
    await refresh()
  }

  async function duplicateCharacter(id: string) {
    const src = characters.find((c) => c.id === id)
    if (!src) return
    await api.createConcept({ ...src, id: '', name: src.name + '（副本）' })
    await refresh()
  }

  async function createCharacter() {
    await api.createConcept({
      id: '',
      type: 'character',
      name: '新人物',
      aliases: [],
      description: '',
      color: '#e6194b',
      personality: '',
      background: '',
      identity: '',
    })
    await refresh()
  }

  async function saveCharacter() {
    if (!draft || !selectedId) return
    try {
      await api.updateConcept(selectedId, draft)
      await refresh()
    } catch (e) {
      await alert(errorMessage(e))
    }
  }

  const appearances = selected ? nodes.filter((n) => (n.characters ?? []).includes(selected.id)) : []

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">人物关系图</h2>
        <p className="text-[11px] text-gray-400 mt-0.5">
          从人物拖到另一人物建立关系；双击连线编辑关系文本；右键空白/节点/连线有菜单
        </p>
      </div>

      <div className="flex-1 relative min-h-0">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onNodeDragStop={(_, node) => {
            const position = { x: node.position.x, y: node.position.y }
            patchRelationsBoard([
              ...relationsBoard.filter((b) => b.conceptId !== node.id),
              { type: 'character', conceptId: node.id, position },
            ])
            api.setCharacterPosition(node.id, position).catch(() => {})
          }}
          onEdgeDoubleClick={onEdgeDoubleClick}
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
          <Controls />
        </ReactFlow>

        {characters.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-sm text-gray-400 bg-white/85 dark:bg-gray-800/85 rounded-lg px-4 py-2 shadow">
              还没有人物，请到「人物」页创建
            </div>
          </div>
        )}

        {menu && (
          <div
            className="absolute z-[200] bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 py-1 text-sm"
            style={{ left: menu.x, top: menu.y }}
          >
            {menu.kind === 'pane' && (
              <>
                <button
                  onClick={() => {
                    createCharacter()
                    setMenu(null)
                  }}
                  className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200"
                >
                  新建人物
                </button>
                <button
                  onClick={() => {
                    if (clipboard) duplicateCharacter(clipboard)
                    else void alert('请先右键某个人物选择「复制」')
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
                    setSelectedId(menu.nodeId)
                    const c = characters.find((x) => x.id === menu.nodeId)
                    if (c) setDraft({ ...c })
                    setMenu(null)
                  }}
                  className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200"
                >
                  编辑属性
                </button>
                <button
                  onClick={() => {
                    deleteCharacter(menu.nodeId)
                    setMenu(null)
                  }}
                  className="block w-full text-left px-4 py-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
                >
                  删除
                </button>
              </>
            )}
            {menu.kind === 'edge' && (
              <>
                <button
                  onClick={() => {
                    const edge = flowEdges.find((e) => e.id === menu.edgeId)
                    if (edge) removeRelation(edge)
                    setMenu(null)
                  }}
                  className="block w-full text-left px-4 py-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
                >
                  删除连线
                </button>
                <button
                  onClick={() => {
                    const edge = flowEdges.find((e) => e.id === menu.edgeId)
                    if (edge) onEdgeDoubleClick({}, edge)
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

      {selected && draft && (
        <div className="max-h-[48%] overflow-y-auto border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ background: selected.color }} />
            <span className="font-semibold text-gray-800 dark:text-gray-200">{selected.name}</span>
          </div>

          <label className="block">
            <span className="text-xs text-gray-500 dark:text-gray-400">名称</span>
            <input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>

          <label className="block">
            <span className="text-xs text-gray-500 dark:text-gray-400">身份</span>
            <input className={inputCls} value={draft.identity ?? ''} onChange={(e) => setDraft({ ...draft, identity: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500 dark:text-gray-400">性格</span>
            <textarea className={inputCls} rows={2} value={draft.personality ?? ''} onChange={(e) => setDraft({ ...draft, personality: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500 dark:text-gray-400">背景</span>
            <textarea className={inputCls} rows={3} value={draft.background ?? ''} onChange={(e) => setDraft({ ...draft, background: e.target.value })} />
          </label>

          <div className="pt-1">
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">出场剧情节点（{appearances.length}）</div>
            {appearances.length === 0 && <div className="text-xs text-gray-400">尚未识别到出场节点</div>}
            <div className="flex flex-wrap gap-1.5">
              {appearances.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    setCurrentNodeId(n.id)
                    setActivePage('nodes')
                  }}
                  className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 text-gray-600 dark:text-gray-300"
                >
                  {n.title || '未命名节点'}
                </button>
              ))}
            </div>
          </div>

          <button onClick={saveCharacter} className="w-full bg-blue-600 text-white rounded-md py-2 text-sm hover:bg-blue-700">
            保存修改
          </button>
        </div>
      )}
    </div>
  )
}
