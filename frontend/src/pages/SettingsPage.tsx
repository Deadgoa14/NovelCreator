import { FONT_FAMILIES, FONT_SIZES, useSettings } from '../settings'

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

export function SettingsPage() {
  const s = useSettings()

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="p-3 border-b border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">设置</h2>
        <p className="text-[11px] text-gray-400 mt-0.5">偏好设置会自动保存到本机浏览器。</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 divide-y divide-gray-100 dark:divide-gray-700">
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
        </div>
      </div>
    </div>
  )
}
