import { useRef } from 'react'
import type { ReactNode } from 'react'
import { api } from '../api'
import { useStore } from '../store'
import { useSettings } from '../settings'
import { highlightText } from '../highlight'
import { uid } from '../util'
import type { Beat, Concept, Volume } from '../types'

// Shared non-exported-text styling: italic + reduced opacity.
const nonExportCls = 'italic opacity-60'

function HighlightTextarea({
  value,
  onChange,
  concepts,
  fontFamily,
  fontSize,
  textColor,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  concepts: Concept[]
  fontFamily: string
  fontSize: number
  textColor: string
  placeholder?: string
}) {
  const shared: React.CSSProperties = {
    fontFamily,
    fontSize: `${fontSize}px`,
    lineHeight: 1.9,
  }
  return (
    <div className="relative w-full">
      <pre
        aria-hidden
        className="whitespace-pre-wrap break-words m-0"
        style={{ ...shared, color: textColor, minHeight: '1.5em' }}
      >
        {value ? highlightText(value, concepts) : <span className="text-gray-400 dark:text-gray-500">{placeholder}</span>}
      </pre>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full resize-none overflow-hidden bg-transparent border-0 outline-none p-0 m-0"
        style={{ ...shared, color: 'transparent', caretColor: '#3b82f6' }}
      />
    </div>
  )
}

export function EditorPane() {
  const currentNode = useStore((s) => s.currentNode)
  const currentNodeId = useStore((s) => s.currentNodeId)
  const currentVolumeId = useStore((s) => s.currentVolumeId)
  const volumes = useStore((s) => s.volumes)
  const concepts = useStore((s) => s.concepts)
  const patchCurrentNode = useStore((s) => s.patchCurrentNode)
  const patchNodes = useStore((s) => s.patchNodes)
  const patchVolumes = useStore((s) => s.patchVolumes)
  const { previewFontFamily, previewFontSize, previewTextBg, previewMarginBg, theme } = useSettings()
  const textColor = theme === 'dark' ? '#e5e7eb' : '#1f2937'

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<{ title?: string; beats?: Beat[] }>({})
  const volTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const volPendingRef = useRef<Partial<Volume>>({})

  const selectedVolume: Volume | null = volumes.find((v) => v.id === currentVolumeId) ?? null

  function scheduleSave(patch: { title?: string; beats?: Beat[] }) {
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

  if (!selectedVolume && !currentNode) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 text-sm">
        选择或创建一个剧情节点
      </div>
    )
  }

  const shell = (header: ReactNode, body: ReactNode) => (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">{header}</div>
        <span className="text-xs text-gray-400 shrink-0">编辑</span>
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
          <HighlightTextarea
            value={selectedVolume.body ?? ''}
            onChange={(v) => scheduleVolumeSave({ body: v })}
            concepts={concepts}
            fontFamily={previewFontFamily}
            fontSize={previewFontSize}
            textColor={textColor}
            placeholder="一首诗、一段引子…（换行即分段）"
          />
        </section>
      </>
    )
    return shell(<span>{selectedVolume.name || '未命名卷'}</span>, body)
  }

  const beats = currentNode!.beats ?? []
  const body = (
    <>
      <input
        value={currentNode!.title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="节点标题"
        className="w-full text-xl font-bold bg-transparent border-b border-gray-300 dark:border-gray-600 pb-2 mb-6 focus:outline-none focus:border-blue-500 text-gray-800 dark:text-gray-100"
      />
      {beats.length === 0 && (
        <div className="text-gray-400 text-sm text-center py-10">暂无梗概条目，点击下方「＋ 添加条目」</div>
      )}
      {beats.map((b, i) => (
        <section key={b.id} className="mb-7">
          <div className="mb-1.5 flex items-center gap-2">
            <input
              value={b.text}
              onChange={(e) => onBeatChange(i, { text: e.target.value })}
              placeholder={`梗概 ${i + 1}（不导出）`}
              className="flex-1 text-[0.95em] font-semibold bg-transparent border-b border-gray-200 dark:border-gray-700 focus:border-blue-400 focus:outline-none pb-1 italic opacity-70 text-gray-600 dark:text-gray-300"
            />
            <button onClick={() => removeBeat(i)} className="text-gray-300 hover:text-red-500 text-sm shrink-0" title="删除条目">
              ✕
            </button>
          </div>
          <HighlightTextarea
            value={b.body ?? ''}
            onChange={(v) => onBeatChange(i, { body: v })}
            concepts={concepts}
            fontFamily={previewFontFamily}
            fontSize={previewFontSize}
            textColor={textColor}
            placeholder="在这里写正文，换行即分段…"
          />
        </section>
      ))}
      <button
        onClick={addBeat}
        className="w-full py-2 rounded-md border border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 hover:border-blue-400 transition-colors"
      >
        ＋ 添加条目
      </button>
    </>
  )
  return shell(<span title={currentNode!.title}>{currentNode!.title || '未命名节点'}</span>, body)
}
