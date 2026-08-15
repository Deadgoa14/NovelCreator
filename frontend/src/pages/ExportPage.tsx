import { useEffect, useState } from 'react'
import { api, errorMessage } from '../api'
import { useStore } from '../store'
import type { ExportSettings } from '../types'

function GapSwitch({
  label,
  enabled,
  onEnabled,
  lines,
  onLines,
}: {
  label: string
  enabled: boolean
  onEnabled: (v: boolean) => void
  lines: number
  onLines: (v: number) => void
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => onEnabled(e.target.checked)}
        className="h-4 w-4 rounded border-gray-300"
      />
      <span>{label}</span>
      <span className="text-xs text-gray-400">空</span>
      <input
        type="number"
        min={0}
        disabled={!enabled}
        value={lines}
        onChange={(e) => onLines(Math.max(0, Number(e.target.value) || 0))}
        className="w-16 text-sm border border-gray-300 rounded px-2 py-1 disabled:opacity-40 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
      />
      <span className="text-xs text-gray-400">行</span>
    </label>
  )
}

export function ExportPage() {
  const storylines = useStore((s) => s.storylines)
  const exportSettings = useStore((s) => s.exportSettings)
  const patchExportSettings = useStore((s) => s.patchExportSettings)
  const [selectedId, setSelectedId] = useState<string>(storylines[0]?.id ?? '')
  const [content, setContent] = useState('')
  const [filename, setFilename] = useState('')
  const [charCount, setCharCount] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [indent, setIndent] = useState(exportSettings.indentParagraph)
  const [paragraphGap, setParagraphGap] = useState(exportSettings.paragraphGap)
  const [headEnabled, setHeadEnabled] = useState(exportSettings.chapterHeadBlank > 0)
  const [headLines, setHeadLines] = useState(Math.max(1, exportSettings.chapterHeadBlank))
  const [tailEnabled, setTailEnabled] = useState(exportSettings.chapterTailBlank > 0)
  const [tailLines, setTailLines] = useState(Math.max(1, exportSettings.chapterTailBlank))

  // Persist any setting change to export-settings.json so it survives between exports.
  useEffect(() => {
    const next: ExportSettings = {
      indentParagraph: indent,
      paragraphGap,
      chapterHeadBlank: headEnabled ? headLines : 0,
      chapterTailBlank: tailEnabled ? tailLines : 0,
    }
    patchExportSettings(next)
    api.saveExportSettings(next).catch(() => {})
  }, [indent, paragraphGap, headEnabled, headLines, tailEnabled, tailLines, patchExportSettings])

  async function doExport() {
    if (!selectedId) return
    setError('')
    try {
      const r = await api.export(selectedId, {
        indentParagraph: indent,
        paragraphGap,
        chapterHeadBlank: headEnabled ? headLines : 0,
        chapterTailBlank: tailEnabled ? tailLines : 0,
      })
      setContent(r.content)
      setFilename(r.filename)
      setCharCount(r.charCount)

      const blob = new Blob([r.content], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = r.filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">导出全篇</h2>
        <div className="flex gap-2">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="flex-1 text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
          >
            {storylines.length === 0 && <option value="">暂无故事线</option>}
            {storylines.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}（{s.nodes.length} 个节点）
              </option>
            ))}
          </select>
          <button
            onClick={doExport}
            disabled={!selectedId}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            导出为 txt
          </button>
        </div>

        <div className="mt-3 space-y-2 text-sm">
          <label className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={indent}
              onChange={(e) => setIndent(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            段落开头空两格
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <span>段落之间空</span>
            <input
              type="number"
              min={0}
              value={paragraphGap}
              onChange={(e) => setParagraphGap(Math.max(0, Number(e.target.value) || 0))}
              className="w-16 text-sm border border-gray-300 rounded px-2 py-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
            />
            <span className="text-xs text-gray-400">行</span>
          </label>

          <GapSwitch
            label="章节开头"
            enabled={headEnabled}
            onEnabled={setHeadEnabled}
            lines={headLines}
            onLines={setHeadLines}
          />
          <GapSwitch
            label="章节末尾"
            enabled={tailEnabled}
            onEnabled={setTailEnabled}
            lines={tailLines}
            onLines={setTailLines}
          />
        </div>

        <p className="text-[11px] text-gray-400 mt-2">
          按故事线的连接顺序拼接每个梗概条目的正文，每个剧情节点自动生成章节序号。
        </p>
        {error && <div className="text-red-600 text-sm mt-2">{error}</div>}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {content ? (
          <>
            <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">预计字数：约 {charCount ?? 0} 字</div>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              {content}
            </pre>
          </>
        ) : (
          <div className="text-center text-gray-400 text-sm py-10">选择一条故事线并点击导出</div>
        )}
      </div>
    </div>
  )
}
