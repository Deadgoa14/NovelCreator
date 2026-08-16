import { useState } from 'react'
import type { ReactNode } from 'react'
import { api, errorMessage } from '../api'
import type { RawAnalysis } from '../api'
import { useStore } from '../store'
import { useDialog } from '../components/Dialog'
import { uid } from '../util'
import type { Beat, Concept } from '../types'

const AI_COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#f032e6', '#008080', '#9a6324']

function CheckRow({
  checked,
  onToggle,
  title,
  desc,
}: {
  checked: boolean
  onToggle: (v: boolean) => void
  title: string
  desc?: string
}) {
  return (
    <label className="flex items-start gap-2 py-1 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onToggle(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-gray-300"
      />
      <span className="text-sm">
        <span className="text-gray-800 dark:text-gray-200">{title}</span>
        {desc && <span className="block text-xs text-gray-400">{desc}</span>}
      </span>
    </label>
  )
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{title}</div>
        {action}
      </div>
      {children}
    </div>
  )
}

export function RawAnalysisPage() {
  const storylines = useStore((s) => s.storylines)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<RawAnalysis | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [storylineId, setStorylineId] = useState('')
  const { alert } = useDialog()

  function toggle(key: string, on: boolean) {
    setSel((prev) => {
      const next = new Set(prev)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })
  }

  async function analyze() {
    if (!text.trim()) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const r = await api.analyzeRaw(text)
      setResult(r)
      // Select everything by default so a single import grabs the whole result.
      const all = new Set<string>()
      r.worldbuilding.forEach((_, i) => all.add('w' + i))
      r.characters.forEach((_, i) => all.add('c' + i))
      r.concepts.forEach((_, i) => all.add('p' + i))
      r.beats.forEach((_, i) => all.add('b' + i))
      setSel(all)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  function clear() {
    setText('')
    setResult(null)
    setError('')
    setSel(new Set())
  }

  async function importEntities() {
    if (!result) return
    const s = useStore.getState()
    let colorIdx = s.concepts.length
    const toCreate: Concept[] = []
    result.worldbuilding.forEach((w, i) => {
      if (sel.has('w' + i))
        toCreate.push({ id: '', type: 'generic', name: w.name, aliases: [], description: w.description, color: AI_COLORS[colorIdx++ % AI_COLORS.length] })
    })
    result.characters.forEach((c, i) => {
      if (sel.has('c' + i))
        toCreate.push({
          id: '',
          type: 'character',
          name: c.name,
          aliases: c.aliases,
          description: c.description,
          color: AI_COLORS[colorIdx++ % AI_COLORS.length],
          identity: c.identity,
          personality: c.personality,
          background: c.background,
        })
    })
    result.concepts.forEach((c, i) => {
      if (sel.has('p' + i))
        toCreate.push({ id: '', type: c.type, name: c.name, aliases: c.aliases, description: c.description, color: AI_COLORS[colorIdx++ % AI_COLORS.length] })
    })
    if (!toCreate.length) {
      await alert('请先勾选要导入的设定 / 人物 / 概念')
      return
    }
    for (const c of toCreate) await api.createConcept(c)
    const data = await api.getConcepts()
    s.patchConcepts(data.concepts, data.relations)
    await alert(`已导入 ${toCreate.length} 个概念`)
  }

  async function importBeats() {
    if (!result) return
    const s = useStore.getState()
    const idx = result.beats.map((_, i) => i).filter((i) => sel.has('b' + i))
    if (!idx.length) {
      await alert('请先勾选要导入的剧情')
      return
    }
    const beats: Beat[] = idx.map((i) => ({ id: uid('beat'), text: result.beats[i].text, body: result.beats[i].body }))
    const node = await api.createNode()
    await api.updateNode(node.id, { title: result.title || '生文本分析', beats })
    if (storylineId) {
      const sl = s.storylines.find((x) => x.id === storylineId)
      if (sl) {
        await api.updateStoryline(sl.id, { ...sl, nodes: [...sl.nodes, node.id] })
        const r = await api.getStorylines()
        s.patchStorylines(r.storylines)
      }
    }
    s.patchNodes(await api.listNodes())
    s.setCurrentNodeId(node.id)
    await alert(`已新建剧情节点「${result.title || '生文本分析'}」并写入 ${beats.length} 条梗概`)
  }

  const hasEntities = (result?.worldbuilding.length ?? 0) + (result?.characters.length ?? 0) + (result?.concepts.length ?? 0) > 0

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">生文本分析</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="在这里粘贴你的「生文本」——可以是设定、正文、背景、人物笔记、灵感片段…杂糅在一起也没关系。"
          className="w-full h-44 text-sm border border-gray-300 rounded-md px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
        />

        <div className="flex gap-2">
          <button
            onClick={analyze}
            disabled={loading || !text.trim()}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '分析中…' : '一键分析'}
          </button>
          <button
            onClick={clear}
            className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            清空
          </button>
        </div>

        {error && <div className="text-red-600 text-sm">{error}</div>}

        {result && (
          <>
            {(result.title || result.summary) && (
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-3 space-y-1">
                {result.title && <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">《{result.title}》</div>}
                {result.summary && <div className="text-sm text-gray-600 dark:text-gray-300">{result.summary}</div>}
              </div>
            )}

            {hasEntities && (
              <Section
                title="设定 / 人物 / 概念"
                action={
                  <button onClick={importEntities} className="text-xs text-blue-600 hover:text-blue-700">
                    导入所选
                  </button>
                }
              >
                {result.worldbuilding.map((w, i) => (
                  <CheckRow key={'w' + i} checked={sel.has('w' + i)} onToggle={(v) => toggle('w' + i, v)} title={w.name} desc={w.description} />
                ))}
                {result.characters.map((c, i) => (
                  <CheckRow
                    key={'c' + i}
                    checked={sel.has('c' + i)}
                    onToggle={(v) => toggle('c' + i, v)}
                    title={`${c.name}${c.aliases?.length ? '（' + c.aliases.join('、') + '）' : ''}`}
                    desc={[c.identity, c.description].filter(Boolean).join(' · ')}
                  />
                ))}
                {result.concepts.map((c, i) => (
                  <CheckRow key={'p' + i} checked={sel.has('p' + i)} onToggle={(v) => toggle('p' + i, v)} title={c.name} desc={c.description} />
                ))}
              </Section>
            )}

            {result.beats.length > 0 && (
              <Section
                title="剧情"
                action={
                  <div className="flex items-center gap-2">
                    <select
                      value={storylineId}
                      onChange={(e) => setStorylineId(e.target.value)}
                      className="text-xs border border-gray-300 rounded px-2 py-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                    >
                      <option value="">不挂到故事线</option>
                      {storylines.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <button onClick={importBeats} className="text-xs text-blue-600 hover:text-blue-700 whitespace-nowrap">
                      导入剧情（新建节点）
                    </button>
                  </div>
                }
              >
                {result.beats.map((b, i) => (
                  <CheckRow key={'b' + i} checked={sel.has('b' + i)} onToggle={(v) => toggle('b' + i, v)} title={b.text || '（无梗概）'} desc={b.body} />
                ))}
              </Section>
            )}
          </>
        )}

        {!result && !loading && !error && (
          <div className="text-center text-gray-400 text-sm py-6">粘贴生文本后点「一键分析」，AI 会拆出人物、设定、概念与剧情。</div>
        )}
      </div>
    </div>
  )
}
