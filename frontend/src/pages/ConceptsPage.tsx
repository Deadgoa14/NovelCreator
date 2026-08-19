import { useEffect, useMemo, useState } from 'react'
import { api, errorMessage } from '../api'
import { useStore } from '../store'
import { useDialog } from '../components/Dialog'
import { ExportDialog } from '../components/ExportDialog'
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
    category: '',
    tags: [],
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
  const newConceptRequest = useStore((s) => s.newConceptRequest)
  const consumeNewConceptRequest = useStore((s) => s.consumeNewConceptRequest)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Concept | null>(null)
  const [aliasInput, setAliasInput] = useState('')
  const [query, setQuery] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const { alert, confirm } = useDialog()

  const matches = (c: Concept, q: string): boolean => {
    if (!q) return true
    if ((c.name || '').toLowerCase().includes(q)) return true
    if ((c.aliases ?? []).some((a) => a.toLowerCase().includes(q))) return true
    if ((c.category ?? '').toLowerCase().includes(q)) return true
    if ((c.tags ?? []).some((tid) => {
      const t = concepts.find((x) => x.id === tid)
      return t ? (t.name || '').toLowerCase().includes(q) : false
    })) return true
    return false
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return concepts.filter((c) => {
      const typeOk = isChar ? c.type === 'character' : c.type !== 'character'
      if (!typeOk) return false
      return matches(c, q)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concepts, isChar, query])

  // Characters grouped by 类 (category), for a QQ-friend-list style layout.
  const groups = useMemo(() => {
    if (!isChar) return null
    const q = query.trim().toLowerCase()
    const chars = concepts.filter((c) => c.type === 'character' && matches(c, q))
    chars.sort((a, b) => {
      const ca = a.category ?? ''
      const cb = b.category ?? ''
      if (ca !== cb) return ca.localeCompare(cb, 'zh')
      return (a.name || '').localeCompare(b.name || '', 'zh')
    })
    const out: { category: string; items: Concept[] }[] = []
    let cur: { category: string; items: Concept[] } | null = null
    for (const c of chars) {
      const cat = c.category ?? ''
      if (!cur || cur.category !== cat) {
        cur = { category: cat, items: [] }
        out.push(cur)
      }
      cur.items.push(c)
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concepts, isChar, query])

  const tagCandidates = useMemo(() => {
    const q = tagInput.trim().toLowerCase()
    if (!q) return []
    return concepts
      .filter((c) => c.type !== 'character')
      .filter((c) => (c.name || '').toLowerCase().includes(q) || (c.aliases ?? []).some((a) => a.toLowerCase().includes(q)))
      .slice(0, 8)
  }, [concepts, tagInput])

  // Consume a "register as concept/character" request from the editor's context menu.
  useEffect(() => {
    if (!newConceptRequest) return
    if (newConceptRequest.type !== (isChar ? 'character' : 'generic')) return
    setSelectedId(null)
    setAliasInput('')
    setDraft({ ...newConcept(newConceptRequest.type), name: newConceptRequest.name })
    consumeNewConceptRequest()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newConceptRequest, isChar])

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
      setCurrentNode({ id: n.id, title: n.meta.title ?? '', beats: n.meta.beats ?? [], questions: n.meta.questions ?? [] })
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
        // Collect 1:1 renames: the primary name and/or a single renamed alias.
        const renames: { oldTerm: string; newTerm: string }[] = []
        if (old) {
          if (old.name !== concept.name) renames.push({ oldTerm: old.name, newTerm: concept.name })
          const oldAliases = old.aliases ?? []
          const newAliases = concept.aliases ?? []
          const removed = oldAliases.filter((a) => !newAliases.includes(a))
          const added = newAliases.filter((a) => !oldAliases.includes(a))
          if (removed.length === 1 && added.length === 1) {
            renames.push({ oldTerm: removed[0], newTerm: added[0] })
          }
        }
        if (renames.length > 0) {
          const desc = renames.map((r) => `「${r.oldTerm}」→「${r.newTerm}」`).join('、')
          const apply = await confirm(
            `将 ${desc} 应用到全局正文？\n\n所有剧情节点梗概和正文中的对应文字将被替换；其他名字与别名保持不变。`,
          )
          if (apply) {
            let total = 0
            for (const r of renames) {
              const res = await api.renameConcept(selectedId, r.oldTerm, r.newTerm, true)
              total += res.total
            }
            await alert(`已替换 ${total} 处`)
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

  function addTag(id: string) {
    if (!draft) return
    const tags = draft.tags ?? []
    if (!tags.includes(id)) setDraft({ ...draft, tags: [...tags, id] })
    setTagInput('')
  }

  async function createTag() {
    const name = tagInput.trim()
    if (!name) return
    try {
      const created = await api.createConcept({ id: '', type: 'generic', name, aliases: [], description: '', color: '#3cb44b' })
      await refresh()
      addTag(created.id)
    } catch (e) {
      await alert(errorMessage(e))
    }
  }

  function renderRow(c: Concept) {
    const tagConcepts = (c.tags ?? []).map((tid) => concepts.find((x) => x.id === tid)).filter((x): x is Concept => !!x)
    return (
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
          {tagConcepts.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-0.5">
              {tagConcepts.map((t) => (
                <span key={t.id} className="text-[10px] px-1 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300">
                  {t.name}
                </span>
              ))}
            </div>
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
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{isChar ? '人物' : '概念'}</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setExportOpen(true)}
            className="px-2.5 py-1.5 text-xs text-gray-600 dark:text-gray-200 rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            导出
          </button>
          <button
            onClick={() => startNew(isChar ? 'character' : 'generic')}
            className={`px-2.5 py-1.5 text-xs text-white rounded-md hover:opacity-90 ${isChar ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-600 hover:bg-gray-700'}`}
          >
            {isChar ? '＋ 人物' : '＋ 概念'}
          </button>
        </div>
      </div>

      <div className="px-3 py-1.5 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={isChar ? '搜索人物（名称 / 别名）…' : '搜索概念（名称 / 别名）…'}
          className="flex-1 text-xs border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {query && (
          <button onClick={() => setQuery('')} className="text-xs text-gray-400 hover:text-gray-600">
            清除
          </button>
        )}
      </div>

      <div className="max-h-[40%] overflow-y-auto border-b border-gray-200 dark:border-gray-700">
        {isChar && groups ? (
          groups.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">
              <div className="mb-2">暂无人物</div>
              <button onClick={() => startNew('character')} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700">
                ＋ 新建人物
              </button>
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.category || 'none'}>
                {g.category && (
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/60 border-y border-gray-100 dark:border-gray-700">
                    {g.category}
                  </div>
                )}
                {g.items.map(renderRow)}
              </div>
            ))
          )
        ) : visible.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">
            <div className="mb-2">暂无概念</div>
            <button onClick={() => startNew('generic')} className="px-3 py-1.5 text-xs bg-gray-600 text-white rounded-md hover:bg-gray-700">
              ＋ 新建概念
            </button>
          </div>
        ) : (
          visible.map(renderRow)
        )}
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
                <span className="text-xs text-gray-500 dark:text-gray-400">类（分组，如 家人 / 朋友）</span>
                <input
                  className={inputCls}
                  value={draft.category ?? ''}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                  placeholder="留空则不分组"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500 dark:text-gray-400">标签（关联到概念，如家族 / 派系 / 势力）</span>
                {(draft.tags ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1 mb-1">
                    {(draft.tags ?? []).map((tid) => {
                      const tc = concepts.find((x) => x.id === tid)
                      return (
                        <span key={tid} className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                          {tc?.name ?? tid}
                          <button
                            onClick={() => setDraft({ ...draft, tags: (draft.tags ?? []).filter((t) => t !== tid) })}
                            className="text-blue-400 hover:text-red-500"
                          >
                            ✕
                          </button>
                        </span>
                      )
                    })}
                  </div>
                )}
                <input
                  className={inputCls}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="输入概念名搜索，回车/点击添加…"
                />
                {tagInput.trim() && (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-md mt-1 divide-y divide-gray-100 dark:divide-gray-700 max-h-40 overflow-y-auto">
                    {tagCandidates.map((tc) => (
                      <button
                        key={tc.id}
                        onClick={() => addTag(tc.id)}
                        className="block w-full text-left px-2 py-1.5 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30 text-gray-700 dark:text-gray-200"
                      >
                        {tc.name}
                        {tc.aliases?.length ? <span className="text-xs text-gray-400">（{tc.aliases.join('、')}）</span> : null}
                      </button>
                    ))}
                    {!tagCandidates.some((tc) => tc.name === tagInput.trim()) && (
                      <button
                        onClick={createTag}
                        className="block w-full text-left px-2 py-1.5 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                      >
                        ＋ 创建概念「{tagInput.trim()}」并添加
                      </button>
                    )}
                  </div>
                )}
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
      {exportOpen && <ExportDialog kind={isChar ? 'characters' : 'concepts'} onClose={() => setExportOpen(false)} />}
    </div>
  )
}
