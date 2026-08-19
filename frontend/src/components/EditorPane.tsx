import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { EditorView } from '@codemirror/view'
import { api, errorMessage } from '../api'
import { useStore } from '../store'
import { useSettings } from '../settings'
import { uid } from '../util'
import { launchContinue, launchExtract, launchPolish, launchProofread, launchSummarize } from '../aiTasks'
import { CodeBodyEditor } from './CodeBodyEditor'
import { useDialog } from './Dialog'
import type { Beat, Question, Volume } from '../types'

// Shared non-exported-text styling: italic + reduced opacity.
const nonExportCls = 'italic opacity-60'

export function EditorPane() {
  const currentNode = useStore((s) => s.currentNode)
  const currentNodeId = useStore((s) => s.currentNodeId)
  const currentVolumeId = useStore((s) => s.currentVolumeId)
  const volumes = useStore((s) => s.volumes)
  const patchCurrentNode = useStore((s) => s.patchCurrentNode)
  const patchNodes = useStore((s) => s.patchNodes)
  const patchVolumes = useStore((s) => s.patchVolumes)
  const concepts = useStore((s) => s.concepts)
  const focusBeat = useStore((s) => s.focusBeat)
  const setActivePage = useStore((s) => s.setActivePage)
  const requestNewConcept = useStore((s) => s.requestNewConcept)
  const { previewFontFamily, previewFontSize, previewTextBg, previewMarginBg, theme, summarizeChars } = useSettings()
  const textColor = theme === 'dark' ? '#e5e7eb' : '#1f2937'
  const summaryColor = theme === 'dark' ? '#d1d5db' : '#4b5563'

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<{ title?: string; beats?: Beat[]; questions?: Question[] }>({})
  const volTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const volPendingRef = useRef<Partial<Volume>>({})
  const beatTextRefs = useRef<Record<string, EditorView | null>>({})
  const beatSectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const lastFocusNonce = useRef<number | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [notePick, setNotePick] = useState<{ beatIndex: number; notes: string[] } | null>(null)
  const [resolving, setResolving] = useState(false)
  const { alert } = useDialog()

  const selectedVolume: Volume | null = volumes.find((v) => v.id === currentVolumeId) ?? null

  // Jump to a specific beat entry (from a beat button elsewhere): scroll the whole
  // entry to the top of the editor and put the cursor at the end of its 梗概 text.
  // Handled once per request (nonce); retries until the node + textarea are mounted.
  useEffect(() => {
    const fb = focusBeat
    if (!fb) return
    if (lastFocusNonce.current === fb.nonce) return
    if (!currentNode || currentNode.id !== fb.nodeId) return
    const section = beatSectionRefs.current[fb.beatId]
    const view = beatTextRefs.current[fb.beatId]
    if (!section || !view) return
    lastFocusNonce.current = fb.nonce
    section.scrollIntoView({ behavior: 'smooth', block: 'start' })
    view.focus()
    const len = view.state.doc.length
    view.dispatch({ selection: { anchor: len } })
  }, [focusBeat, currentNode])

  // Reset the fold state when switching nodes.
  useEffect(() => {
    setCollapsed(new Set())
  }, [currentNodeId])

  function scheduleSave(patch: { title?: string; beats?: Beat[]; questions?: Question[] }) {
    pendingRef.current = { ...pendingRef.current, ...patch }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      const p = pendingRef.current
      pendingRef.current = {}
      if (!currentNodeId) return
      await api.updateNode(currentNodeId, p)
      patchNodes(await api.listNodes())
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
    const beats = currentNode?.beats ?? []
    const next = beats.map((b, i) => (i === index ? { ...b, ...patch } : b))
    patchCurrentNode({ beats: next })
    scheduleSave({ beats: next })
  }

  function onQuestionsChange(questions: Question[]) {
    patchCurrentNode({ questions })
    scheduleSave({ questions })
  }

  function addBeat() {
    const beats = currentNode?.beats ?? []
    const next = [...beats, { id: uid('beat'), text: '', body: '' }]
    patchCurrentNode({ beats: next })
    scheduleSave({ beats: next })
  }

  function removeBeat(index: number) {
    const beats = currentNode?.beats ?? []
    const next = beats.filter((_, i) => i !== index)
    patchCurrentNode({ beats: next })
    scheduleSave({ beats: next })
  }

  function toggleBeat(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllBeats() {
    const beats = currentNode?.beats ?? []
    if (!beats.length) return
    const allCollapsed = beats.every((b) => collapsed.has(b.id))
    setCollapsed(allCollapsed ? new Set() : new Set(beats.map((b) => b.id)))
  }

  // ----- AI helpers -----
  function nodeBodyText() {
    return (currentNode?.beats ?? []).map((b) => (b.text || '') + '\n' + (b.body || '')).join('\n')
  }

  function onContinue(index: number) {
    const notes = currentNode?.beats?.[index]?.notes ?? []
    if (!notes.length) {
      launchContinue(currentNodeId ?? '', index)
      return
    }
    setNotePick({ beatIndex: index, notes })
  }

  function addQuestion() {
    const next = [...(currentNode?.questions ?? []), { id: uid('question'), text: '', answer: '' }]
    onQuestionsChange(next)
  }

  function registerText(type: 'character' | 'generic', text: string) {
    setActivePage(type === 'character' ? 'characters' : 'concepts')
    requestNewConcept(type, text)
  }

  async function resolveQuestions() {
    const qs = currentNode?.questions ?? []
    const pendingIdx = qs.map((q, i) => ((q.answer ?? '').trim() ? -1 : i)).filter((i) => i !== -1)
    if (!pendingIdx.length) {
      await alert('没有未回答的问题')
      return
    }
    setResolving(true)
    try {
      const r = await api.resolveQuestions(
        currentNodeId ?? '',
        pendingIdx.map((i) => qs[i].text),
      )
      const answers = r.answers ?? []
      const next = qs.map((q, i) => {
        const pos = pendingIdx.indexOf(i)
        return pos !== -1 && answers[pos] ? { ...q, answer: answers[pos] } : q
      })
      onQuestionsChange(next)
    } catch (e) {
      await alert(errorMessage(e))
    } finally {
      setResolving(false)
    }
  }

  if (!selectedVolume && !currentNode) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 text-sm">
        选择或创建一个剧情节点
      </div>
    )
  }

  const shell = (header: ReactNode, body: ReactNode, headerAction?: ReactNode) => (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">{header}</div>
        <div className="flex items-center gap-2 shrink-0">
          {headerAction}
          <span className="text-xs text-gray-400">编辑</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ background: previewMarginBg }}>
        <div
          className="max-w-[640px] mx-auto px-8 py-8 min-h-full"
          style={{
            background: previewTextBg,
            fontFamily: previewFontFamily,
            fontSize: `${previewFontSize}px`,
            lineHeight: 1.9,
            color: textColor,
          }}
        >
          {body}
        </div>
      </div>

      <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <span className="text-xs text-gray-400">
          正文中出现的概念会<span className="font-medium" style={{ color: '#e6194b' }}>彩色高亮</span>；斜体浅色 = 仅预览、不导出
        </span>
      </div>
    </div>
  )

  if (selectedVolume) {
    const body = (
      <>
        <input
          value={selectedVolume.name}
          onChange={(e) => scheduleVolumeSave({ name: e.target.value })}
          placeholder="卷名"
          className="w-full text-xl font-bold bg-transparent border-b border-gray-300 dark:border-gray-600 pb-2 mb-6 focus:outline-none focus:border-amber-500 text-gray-800 dark:text-gray-100"
        />
        <section className="mb-6">
          <div className={`text-[11px] uppercase tracking-wide mb-1 ${nonExportCls}`}>卷 · 介绍（不导出）</div>
          <textarea
            value={selectedVolume.intro ?? ''}
            onChange={(e) => scheduleVolumeSave({ intro: e.target.value })}
            rows={2}
            placeholder="主角的童年…"
            className={`w-full bg-transparent resize-y focus:outline-none ${nonExportCls} text-gray-600 dark:text-gray-300`}
            style={{ fontFamily: previewFontFamily, fontSize: `${previewFontSize}px`, lineHeight: 1.9 }}
          />
        </section>
        <section>
          <div className="text-[11px] uppercase tracking-wide mb-1 text-gray-500 dark:text-gray-400">卷 · 正文（导出）</div>
          <CodeBodyEditor
            value={selectedVolume.body ?? ''}
            onChange={(v) => scheduleVolumeSave({ body: v })}
            concepts={concepts}
            fontFamily={previewFontFamily}
            fontSize={previewFontSize}
            textColor={textColor}
            placeholder="一首诗、一段引子…（换行即分段）"
            onRegister={registerText}
          />
        </section>
      </>
    )
    return shell(<span>{selectedVolume.name || '未命名卷'}</span>, body)
  }

  const beats = currentNode!.beats ?? []
  const questions = currentNode!.questions ?? []
  const body = (
    <>
      <input
        value={currentNode!.title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="节点标题"
        className="w-full text-xl font-bold bg-transparent border-b border-gray-300 dark:border-gray-600 pb-2 mb-6 focus:outline-none focus:border-blue-500 text-gray-800 dark:text-gray-100"
      />
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => launchExtract(nodeBodyText())}
          className="px-2.5 py-1 text-xs rounded-md border border-gray-300 text-gray-600 hover:text-blue-600 hover:border-blue-400 dark:border-gray-600 dark:text-gray-300"
        >
          👤 识别角色
        </button>
        <button
          onClick={() => launchSummarize(nodeBodyText(), currentNodeId ?? '', summarizeChars)}
          className="px-2.5 py-1 text-xs rounded-md border border-gray-300 text-gray-600 hover:text-blue-600 hover:border-blue-400 dark:border-gray-600 dark:text-gray-300"
        >
          📝 提炼梗概
        </button>
      </div>
      {beats.length === 0 && (
        <div className="text-gray-400 text-sm text-center py-10">暂无梗概条目，点击下方「＋ 添加条目」</div>
      )}
      {beats.map((b, i) => {
        const isCollapsed = collapsed.has(b.id)
        return (
          <section key={b.id} className="mb-7" ref={(el) => { beatSectionRefs.current[b.id] = el }}>
            <div className="mb-1.5 flex items-start gap-2">
              <button
                onClick={() => toggleBeat(b.id)}
                className="text-gray-400 hover:text-blue-600 text-base leading-none mt-1 shrink-0 select-none"
                title={isCollapsed ? '展开正文' : '折叠正文'}
              >
                {isCollapsed ? '▸' : '▾'}
              </button>
              <CodeBodyEditor
                value={b.text}
                onChange={(v) => onBeatChange(i, { text: v })}
                concepts={concepts}
                fontFamily={previewFontFamily}
                fontSize={previewFontSize + 5}
                textColor={summaryColor}
                placeholder={`梗概 ${i + 1}（不导出）`}
                className="flex-1 italic opacity-70 font-semibold border-b border-gray-200 dark:border-gray-700 pb-1"
                onReady={(view) => {
                  beatTextRefs.current[b.id] = view
                }}
                onRegister={registerText}
              />
              <button onClick={() => removeBeat(i)} className="text-gray-300 hover:text-red-500 text-sm shrink-0" title="删除条目">
                ✕
              </button>
            </div>
            {!isCollapsed && (
              <>
                <div className="mb-2 space-y-1">
                  {(b.notes ?? []).map((n, ni) => (
                    <div key={ni} className="flex items-center gap-1.5">
                      <span className="text-[11px] text-amber-600 dark:text-amber-400 shrink-0">要点</span>
                      <input
                        value={n}
                        onChange={(e) => {
                          const notes = [...(b.notes ?? [])]
                          notes[ni] = e.target.value
                          onBeatChange(i, { notes })
                        }}
                        placeholder="写作要点…（生成正文时可选作提示）"
                        className="flex-1 text-xs bg-transparent border-b border-dashed border-gray-300 dark:border-gray-600 focus:outline-none focus:border-amber-400 text-amber-700 dark:text-amber-300"
                      />
                      <button
                        onClick={() => onBeatChange(i, { notes: (b.notes ?? []).filter((_, x) => x !== ni) })}
                        className="text-gray-300 hover:text-red-500 text-xs shrink-0"
                        title="删除要点"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => onBeatChange(i, { notes: [...(b.notes ?? []), ''] })}
                    className="text-[11px] text-gray-400 hover:text-amber-600"
                  >
                    ＋ 写作要点
                  </button>
                </div>
                <CodeBodyEditor
                  value={b.body ?? ''}
                  onChange={(v) => onBeatChange(i, { body: v })}
                  concepts={concepts}
                  fontFamily={previewFontFamily}
                  fontSize={previewFontSize}
                  textColor={textColor}
                  placeholder="在这里写正文，换行即分段…"
                  onRegister={registerText}
                />
                <div className="mt-1 flex items-center justify-end gap-3">
                  {!((b.body ?? '').trim()) && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 mr-auto">未写正文</span>
                  )}
                  <button
                    onClick={() => onContinue(i)}
                    className="text-xs text-gray-400 hover:text-blue-600"
                  >
                    ✨ 续写
                  </button>
                  <button
                    onClick={() => launchPolish(currentNodeId ?? '', i, b.body ?? '')}
                    className="text-xs text-gray-400 hover:text-blue-600"
                  >
                    💡 润色
                  </button>
                  <button
                    onClick={() => launchProofread(currentNodeId ?? '', i, b.body ?? '')}
                    className="text-xs text-gray-400 hover:text-blue-600"
                  >
                    🔍 审校
                  </button>
                </div>
              </>
            )}
          </section>
        )
      })}
      <section className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">问题（未解决，可交给 AI 补全）</div>
          <button
            onClick={resolveQuestions}
            disabled={resolving}
            className="text-xs text-violet-600 hover:text-violet-700 disabled:opacity-50"
          >
            {resolving ? '补全中…' : '✨ 补全答案'}
          </button>
        </div>
        {questions.length === 0 && <div className="text-gray-400 text-xs mb-2">暂无问题</div>}
        {questions.map((q, qi) => (
          <div key={q.id || qi} className="mb-3">
            <div className="flex items-center gap-2">
              <input
                value={q.text}
                onChange={(e) => {
                  const next = [...questions]
                  next[qi] = { ...q, text: e.target.value }
                  onQuestionsChange(next)
                }}
                placeholder="问题…"
                className="flex-1 text-sm bg-transparent border-b border-gray-200 dark:border-gray-700 focus:outline-none focus:border-violet-500 text-gray-800 dark:text-gray-200"
              />
              <button
                onClick={() => onQuestionsChange(questions.filter((_, x) => x !== qi))}
                className="text-gray-300 hover:text-red-500 text-sm shrink-0"
                title="删除问题"
              >
                ✕
              </button>
            </div>
            <textarea
              value={q.answer ?? ''}
              onChange={(e) => {
                const next = [...questions]
                next[qi] = { ...q, answer: e.target.value }
                onQuestionsChange(next)
              }}
              rows={2}
              placeholder="答案（可让 AI 补全）…"
              className="mt-1 w-full text-xs bg-transparent resize-y focus:outline-none text-violet-700 dark:text-violet-300"
            />
          </div>
        ))}
        <button onClick={addQuestion} className="text-xs text-gray-400 hover:text-violet-600">
          ＋ 问题
        </button>
      </section>
      <button
        onClick={addBeat}
        className="w-full py-2 rounded-md border border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 hover:border-blue-400 transition-colors"
      >
        ＋ 添加条目
      </button>
      {notePick && (
        <NotesPickModal
          notes={notePick.notes}
          onCancel={() => setNotePick(null)}
          onConfirm={(selected) => {
            launchContinue(currentNodeId ?? '', notePick.beatIndex, selected)
            setNotePick(null)
          }}
        />
      )}
    </>
  )
  const foldAction = beats.length > 0 ? (
    <button
      onClick={toggleAllBeats}
      className="px-2.5 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 whitespace-nowrap"
    >
      {beats.every((b) => collapsed.has(b.id)) ? '全部展开' : '全部折叠'}
    </button>
  ) : null
  return shell(<span title={currentNode!.title}>{currentNode!.title || '未命名节点'}</span>, body, foldAction)
}

function NotesPickModal({
  notes,
  onCancel,
  onConfirm,
}: {
  notes: string[]
  onCancel: () => void
  onConfirm: (selected: string[]) => void
}) {
  const [sel, setSel] = useState<Set<number>>(new Set(notes.map((_, i) => i)))
  const all = sel.size === notes.length
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40">
      <div className="w-[380px] max-w-[90vw] bg-white dark:bg-gray-800 rounded-xl shadow-xl p-5">
        <div className="text-sm text-gray-800 dark:text-gray-100 mb-3">选择作为提示词的写作要点</div>
        <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
          {notes.map((n, i) => (
            <label key={i} className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sel.has(i)}
                onChange={(e) => {
                  const next = new Set(sel)
                  if (e.target.checked) next.add(i)
                  else next.delete(i)
                  setSel(next)
                }}
                className="mt-0.5 h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm text-gray-600 dark:text-gray-300 break-words">{n}</span>
            </label>
          ))}
        </div>
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setSel(all ? new Set() : new Set(notes.map((_, i) => i)))}
            className="text-xs text-blue-600 hover:text-blue-700"
          >
            {all ? '全不选' : '全选'}
          </button>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            取消
          </button>
          <button
            onClick={() => onConfirm(notes.filter((_, i) => sel.has(i)))}
            className="px-3 py-1.5 rounded-md text-sm bg-blue-600 text-white hover:bg-blue-700"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  )
}
