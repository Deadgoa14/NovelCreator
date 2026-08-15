import { useMemo, useState } from 'react'
import { api, errorMessage } from '../api'
import { useStore } from '../store'
import { useDialog } from '../components/Dialog'
import type { Concept, ConceptType } from '../types'

const TYPE_LABEL: Record<ConceptType, string> = {
  generic: '通用',
  character: '人物',
  place: '地点',
  item: '物品',
}

function newConcept(type: ConceptType): Concept {
  return {
    id: '',
    type,
    name: '',
    aliases: [],
    description: '',
    color: type === 'character' ? '#e6194b' : '#3cb44b',
    personality: '',
    background: '',
    identity: '',
  }
}

const inputCls =
  'w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100'

export function ConceptsPage({ scope }: { scope: 'concepts' | 'characters' }) {
  const isChar = scope === 'characters'
  const concepts = useStore((s) => s.concepts)
  const patchConcepts = useStore((s) => s.patchConcepts)
  const patchNodes = useStore((s) => s.patchNodes)
  const currentNodeId = useStore((s) => s.currentNodeId)
  const setCurrentNode = useStore((s) => s.setCurrentNode)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Concept | null>(null)
  const [aliasInput, setAliasInput] = useState('')
  const { alert, confirm } = useDialog()

  const visible = useMemo(
    () => concepts.filter((c) => (isChar ? c.type === 'character' : c.type !== 'character')),
    [concepts, isChar],
  )

  async function refresh() {
    const data = await api.getConcepts()
    patchConcepts(data.concepts, data.relations)
  }

  // After a global rename the node bodies were rewritten on disk; reload the
  // node list and the current node so the right-side preview shows fresh text.
  async function refreshAfterRename() {
    patchNodes(await api.listNodes())
    if (currentNodeId) {
      const n = await api.getNode(currentNodeId)
      setCurrentNode({ id: n.id, title: n.meta.title ?? '', beats: n.meta.beats ?? [] })
    }
  }

  function startEdit(c: Concept) {
    setSelectedId(c.id)
    setDraft({ ...c })
    setAliasInput((c.aliases ?? []).join('，'))
  }

  function startNew(type: ConceptType) {
    setSelectedId(null)
    setDraft(newConcept(type))
    setAliasInput('')
  }

  async function save() {
    if (!draft) return
    const concept = {
      ...draft,
      aliases: aliasInput
        .split(/[,，、;；]/)
        .map((s) => s.trim())
        .filter(Boolean),
    }
    if (!concept.name.trim()) {
      await alert('请填写名称')
      return
    }
    try {
      if (selectedId) {
        const old = concepts.find((c) => c.id === selectedId)
        if (old && old.name !== concept.name) {
          const apply = await confirm(
            `将「${old.name}」重命名为「${concept.name}」，是否应用到全局正文？\n\n所有剧情节点梗概和正文中的「${old.name}」将被替换为新名称，别名保持不变。`,
          )
          if (apply) {
            const r = await api.renameConcept(selectedId, concept.name, true)
            await alert(`已替换 ${r.total} 处`)
            await refreshAfterRename()
          } else {
            await api.updateConcept(selectedId, concept)
          }
        } else {
          await api.updateConcept(selectedId, concept)
        }
      } else {
        await api.createConcept(concept)
      }
      await refresh()
      setDraft(null)
      setSelectedId(null)
    } catch (e) {
      await alert(errorMessage(e))
    }
  }

  async function remove(id: string) {
    if (!(await confirm('删除该概念？'))) return
    await api.deleteConcept(id)
    await refresh()
    if (selectedId === id) {
      setDraft(null)
      setSelectedId(null)
    }
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{isChar ? '人物' : '概念'}</h2>
        <button
          onClick={() => startNew(isChar ? 'character' : 'generic')}
          className={`px-2.5 py-1.5 text-xs text-white rounded-md hover:opacity-90 ${isChar ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-600 hover:bg-gray-700'}`}
        >
          {isChar ? '＋ 人物' : '＋ 概念'}
        </button>
      </div>

      <div className="max-h-[40%] overflow-y-auto border-b border-gray-200 dark:border-gray-700">
        {visible.length === 0 && (
          <div className="p-6 text-center text-gray-400 text-sm">{isChar ? '暂无人物' : '暂无概念'}</div>
        )}
        {visible.map((c) => (
          <div
            key={c.id}
            onClick={() => startEdit(c)}
            className={`group flex items-center gap-2.5 px-3 py-2 cursor-pointer border-l-2 ${
              selectedId === c.id
                ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-500'
                : 'border-transparent hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: c.color }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-800 dark:text-gray-200 truncate">{c.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 shrink-0">
                  {TYPE_LABEL[c.type] ?? '通用'}
                </span>
              </div>
              {(c.aliases?.length ?? 0) > 0 && (
                <div className="text-[11px] text-gray-400 dark:text-gray-500 truncate">{c.aliases.join(' / ')}</div>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                remove(c.id)
              }}
              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-xs"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {draft && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <label className="block">
            <span className="text-xs text-gray-500 dark:text-gray-400">名称</span>
            <input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>

          <label className="block">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              别名（支持半角逗号 <code>,</code> / 全角逗号 <code>，</code> / 顿号 <code>、</code> / 分号 <code>;</code>{' '}
              分隔，正文出现任意一个都识别为这个概念）
            </span>
            <input className={inputCls} value={aliasInput} onChange={(e) => setAliasInput(e.target.value)} placeholder="例如：小江, 江公子, 江少侠" />
          </label>

          <div className="flex gap-3">
            {!isChar && (
              <label className="block flex-1">
                <span className="text-xs text-gray-500 dark:text-gray-400">类型</span>
                <select
                  className={inputCls}
                  value={draft.type}
                  onChange={(e) => setDraft({ ...draft, type: e.target.value as ConceptType })}
                >
                  <option value="generic">通用</option>
                  <option value="place">地点</option>
                  <option value="item">物品</option>
                </select>
              </label>
            )}
            <label className="block">
              <span className="text-xs text-gray-500 dark:text-gray-400">颜色</span>
              <input
                type="color"
                className="h-9 w-14 border border-gray-300 rounded-md cursor-pointer"
                value={draft.color}
                onChange={(e) => setDraft({ ...draft, color: e.target.value })}
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs text-gray-500 dark:text-gray-400">解释 / 描述</span>
            <textarea
              className={inputCls}
              rows={3}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </label>

          {draft.type === 'character' && (
            <>
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
            </>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={save} className="flex-1 bg-blue-600 text-white rounded-md py-2 text-sm hover:bg-blue-700">
              保存
            </button>
            <button
              onClick={() => {
                setDraft(null)
                setSelectedId(null)
              }}
              className="px-4 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md py-2 text-sm hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
