import { useStore } from '../store'
import { FONT_FAMILIES, FONT_SIZES, useSettings, type WhiteboardDirection } from '../settings'

const inputCls =
  'w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="text-sm text-gray-600 dark:text-gray-300">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5">{title}</h3>
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 divide-y divide-gray-100 dark:divide-gray-700">
        {children}
      </div>
    </div>
  )
}

export function SettingsPage() {
  const s = useSettings()
  const resetProject = useStore((state) => state.resetProject)

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="p-3 border-b border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">设置</h2>
        <p className="text-[11px] text-gray-400 mt-0.5">偏好设置会自动保存到本机浏览器。</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <Section title="项目">
          <Row label="每次启动时自动打开上次项目">
            <input
              type="checkbox"
              checked={s.autoOpenLast}
              onChange={(e) => s.set({ autoOpenLast: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300"
            />
          </Row>
          <Row label="切换项目">
            <button
              onClick={() => resetProject()}
              className="px-4 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              切换项目
            </button>
          </Row>
        </Section>

        <Section title="外观">
          <Row label="外观模式">
            <div className="flex rounded-md overflow-hidden border border-gray-300 dark:border-gray-600">
              <button
                onClick={() => s.set({ theme: 'light' })}
                className={`px-3 py-1.5 text-sm ${
                  s.theme === 'light' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                }`}
              >
                日间
              </button>
              <button
                onClick={() => s.set({ theme: 'dark' })}
                className={`px-3 py-1.5 text-sm ${
                  s.theme === 'dark' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                }`}
              >
                夜间
              </button>
            </div>
          </Row>
        </Section>

        <Section title="白板">
          <Row label="白板展开梗概字号（px）">
            <input
              type="number"
              min={8}
              max={20}
              value={s.whiteboardBeatFontSize}
              onChange={(e) => s.set({ whiteboardBeatFontSize: Number(e.target.value) || 11 })}
              className="w-20 text-sm border border-gray-300 rounded-md px-2 py-1.5 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
            />
          </Row>
        </Section>

        <Section title="章节目录">
          <Row label="每一卷章节数从头开始计数">
            <input
              type="checkbox"
              checked={s.chapterNumberingPerVolume}
              onChange={(e) => s.set({ chapterNumberingPerVolume: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300"
            />
          </Row>
          <Row label="显示章节数（而非 order）">
            <input
              type="checkbox"
              checked={s.showChapterNumber}
              onChange={(e) => s.set({ showChapterNumber: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300"
            />
          </Row>
        </Section>

        <Section title="梗概分析">
          <Row label="提炼梗概分段字数">
            <input
              type="number"
              min={100}
              step={100}
              value={s.summarizeChars}
              onChange={(e) => s.set({ summarizeChars: Math.max(100, Number(e.target.value) || 1000) })}
              className="w-24 text-sm border border-gray-300 rounded-md px-2 py-1.5 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
            />
            <span className="text-xs text-gray-400">字</span>
          </Row>
        </Section>

        <Section title="故事线白板">
          <Row label="默认发展顺序">
            <select
              value={s.whiteboardDirection}
              onChange={(e) => s.set({ whiteboardDirection: e.target.value as WhiteboardDirection })}
              className={inputCls}
            >
              <option value="lr">左 → 右</option>
              <option value="rl">右 → 左</option>
              <option value="tb">上 → 下</option>
              <option value="bt">下 → 上</option>
            </select>
          </Row>
        </Section>

        <Section title="预览设置">
          <Row label="预览文字区背景色">
            <input
              type="color"
              value={s.previewTextBg}
              onChange={(e) => s.set({ previewTextBg: e.target.value })}
              className="h-8 w-14 border border-gray-300 rounded-md cursor-pointer"
            />
          </Row>

          <Row label="预览两侧留白背景色">
            <input
              type="color"
              value={s.previewMarginBg}
              onChange={(e) => s.set({ previewMarginBg: e.target.value })}
              className="h-8 w-14 border border-gray-300 rounded-md cursor-pointer"
            />
          </Row>

          <Row label="预览字体">
            <select
              value={s.previewFontFamily}
              onChange={(e) => s.set({ previewFontFamily: e.target.value })}
              className={inputCls}
            >
              {FONT_FAMILIES.map((f) => (
                <option key={f.label} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </Row>

          <Row label="预览字号">
            <select
              value={s.previewFontSize}
              onChange={(e) => s.set({ previewFontSize: Number(e.target.value) })}
              className={inputCls}
            >
              {FONT_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}px
                </option>
              ))}
            </select>
          </Row>
        </Section>
      </div>
    </div>
  )
}
