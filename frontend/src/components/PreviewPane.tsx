import type { ReactNode } from 'react'
import { useStore } from '../store'
import { useSettings } from '../settings'
import { highlightText } from '../highlight'
import type { Concept, Volume } from '../types'

// Shared non-exported-text styling: italic + reduced opacity.
const nonExportCls = 'italic opacity-60'

function Paragraphs({ text, concepts, className }: { text: string; concepts: Concept[]; className?: string }) {
  const paragraphs = (text ?? '')
    .split('\n')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
  if (paragraphs.length === 0) return null
  return (
    <>
      {paragraphs.map((p, j) => (
        <p key={j} className={`mb-3 break-words ${className ?? ''}`}>
          {highlightText(p, concepts)}
        </p>
      ))}
    </>
  )
}

export function PreviewPane() {
  const currentNode = useStore((s) => s.currentNode)
  const currentVolumeId = useStore((s) => s.currentVolumeId)
  const volumes = useStore((s) => s.volumes)
  const concepts = useStore((s) => s.concepts)
  const { previewFontFamily, previewFontSize, previewTextBg, previewMarginBg, theme } = useSettings()
  const textColor = theme === 'dark' ? '#e5e7eb' : '#1f2937'

  const selectedVolume: Volume | null = volumes.find((v) => v.id === currentVolumeId) ?? null

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
        <span className="text-xs text-gray-400 shrink-0">预览</span>
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

      <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center gap-4">
        <span className="text-xs text-gray-400">
          <span className="font-medium text-gray-600 dark:text-gray-300">普通文本</span> = 导出 ·{' '}
          <span className="italic opacity-60">斜体浅色文本</span> = 仅预览、不导出
        </span>
      </div>
    </div>
  )

  if (selectedVolume) {
    const body = (
      <>
        <h1 className="text-xl font-bold mb-4 pb-2 border-b border-gray-300">
          {selectedVolume.name || '未命名卷'}
        </h1>
        {(selectedVolume.intro ?? '').trim() && (
          <section className="mb-6">
            <div className={`text-[11px] uppercase tracking-wide mb-1 ${nonExportCls}`}>卷 · 介绍（不导出）</div>
            <Paragraphs text={selectedVolume.intro} concepts={concepts} className={nonExportCls} />
          </section>
        )}
        <section>
          <div className="text-[11px] uppercase tracking-wide mb-1 text-gray-500 dark:text-gray-400">卷 · 正文（导出）</div>
          {(selectedVolume.body ?? '').trim() === '' && (
            <div className="text-gray-400 text-sm text-center py-6">暂无卷正文（引子），请到「剧情节点」页填写</div>
          )}
          <Paragraphs text={selectedVolume.body} concepts={concepts} />
        </section>
      </>
    )
    return shell(<span>{selectedVolume.name || '未命名卷'}</span>, body)
  }

  const beats = currentNode!.beats ?? []
  const body = (
    <>
      {beats.length === 0 && (
        <div className="text-gray-400 text-sm text-center py-10">暂无梗概条目，请在左侧添加</div>
      )}
      {beats.map((b) => {
        const hasBody = (b.body ?? '').split('\n').some((p) => p.trim().length > 0)
        if (!b.text && !hasBody) return null
        return (
          <section key={b.id} className="mb-7">
            {b.text && (
              <div className="mb-3">
                <div className={`text-[11px] uppercase tracking-wide mb-0.5 ${nonExportCls}`}>梗概（不导出）</div>
                <h2 className={`text-[1.15em] font-bold pb-1.5 border-b border-gray-200 ${nonExportCls}`}>
                  {highlightText(b.text, concepts)}
                </h2>
              </div>
            )}
            <Paragraphs text={b.body ?? ''} concepts={concepts} />
          </section>
        )
      })}
    </>
  )
  return shell(<span title={currentNode!.title}>{currentNode!.title || '未命名节点'}</span>, body)
}
