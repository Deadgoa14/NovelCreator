import { useEffect, useState } from 'react'
import { api, errorMessage } from '../api'
import type { RecentProject } from '../api'
import { useStore } from '../store'
import { useSettings } from '../settings'

function fmt(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleString()
}

const inputCls =
  'mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500'

export function ProjectGate() {
  const setProject = useStore((s) => s.setProject)
  const autoOpenLast = useSettings((s) => s.autoOpenLast)
  const skipAutoOpen = useStore((s) => s.skipAutoOpen)
  const consumeSkipAutoOpen = useStore((s) => s.consumeSkipAutoOpen)
  const [loading, setLoading] = useState(true)
  const [recent, setRecent] = useState<RecentProject[]>([])
  const [mode, setMode] = useState<'list' | 'create' | 'open'>('list')
  const [name, setName] = useState('我的小说')
  const [path, setPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // On mount: if enabled, auto-open the last project; otherwise show the list.
  // When the user explicitly clicks「切换项目」, resetProject() sets skipAutoOpen so
  // we show the launcher instead of bouncing straight back into the same project.
  useEffect(() => {
    const shouldAutoOpen = autoOpenLast && !skipAutoOpen
    consumeSkipAutoOpen()
    let cancelled = false
    ;(async () => {
      try {
        const rec = await api.getRecent()
        if (cancelled) return
        if (shouldAutoOpen && rec.lastPath) {
          try {
            const data = await api.openProject(rec.lastPath)
            if (!cancelled) setProject(data, rec.lastPath)
            return
          } catch {
            /* last project missing — fall through to the launcher */
          }
        }
        setRecent(rec.recent)
      } catch {
        /* ignore; show empty launcher */
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function open(p: string) {
    setBusy(true)
    setError('')
    try {
      const data = await api.openProject(p)
      setProject(data, p)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function create() {
    setBusy(true)
    setError('')
    try {
      const p = path.trim()
      const data = await api.createProject(p, name.trim())
      setProject(data, p)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function browse() {
    setError('')
    try {
      const r = await api.pickDirectory()
      if (r.path) setPath(r.path)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  async function removeRow(e: React.MouseEvent, p: string) {
    e.stopPropagation()
    const r = await api.removeRecent(p).catch(() => null)
    if (r) setRecent(r.recent)
  }

  const btnPrimary =
    'w-full bg-blue-600 text-white rounded-md py-2.5 text-sm font-medium disabled:opacity-50 hover:bg-blue-700 transition-colors'
  const btnSecondary =
    'w-full border border-gray-300 text-gray-700 rounded-md py-2.5 text-sm font-medium hover:bg-gray-100 transition-colors'

  return (
    <div className="h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
      <div className="w-[520px] max-w-[94vw] bg-white rounded-2xl shadow-xl p-8">
        <h1 className="text-xl font-bold mb-1">小说写作助手</h1>
        <p className="text-sm text-gray-500 mb-6">项目数据以文件夹形式保存在本地</p>

        {loading ? (
          <div className="py-12 text-center text-gray-400 text-sm">加载中…</div>
        ) : mode === 'list' ? (
          <>
            {recent.length > 0 ? (
              <div className="mb-4 max-h-[280px] overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                {recent.map((r) => (
                  <div
                    key={r.path}
                    onClick={() => open(r.path)}
                    className="group px-4 py-3 cursor-pointer hover:bg-blue-50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-gray-800 truncate">{r.name}</div>
                      <button
                        onClick={(e) => removeRow(e, r.path)}
                        className="text-gray-300 hover:text-red-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="从列表移除"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="text-xs text-gray-500 font-mono truncate mt-0.5">{r.path}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">上次打开：{fmt(r.lastOpened)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mb-4 py-8 text-center text-gray-400 text-sm border border-dashed border-gray-300 rounded-lg">
                暂无最近项目
              </div>
            )}

            <div className="flex flex-col gap-2.5">
              <button onClick={() => setMode('create')} className={btnPrimary} disabled={busy}>
                ＋ 新建项目
              </button>
              <button onClick={() => setMode('open')} className={btnSecondary} disabled={busy}>
                打开已有项目
              </button>
            </div>
          </>
        ) : (
          <>
            <button onClick={() => setMode('list')} className="text-sm text-gray-500 hover:text-gray-700 mb-4">
              ← 返回
            </button>

            {mode === 'create' && (
              <label className="block mb-4">
                <span className="text-sm text-gray-600">项目名称</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
            )}

            <label className="block mb-5">
              <span className="text-sm text-gray-600">
                {mode === 'create' ? '保存路径（空文件夹或不存在的新路径）' : '项目路径（含 project.json 的文件夹）'}
              </span>
              <div className="flex items-center gap-2">
                <input
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="例如：H:/Novels/我的小说"
                  className={inputCls}
                />
                <button
                  onClick={browse}
                  className="shrink-0 px-3 py-2 text-sm border border-gray-300 rounded-md text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  浏览…
                </button>
              </div>
            </label>

            {error && <div className="text-red-600 text-sm mb-4 whitespace-pre-wrap">{error}</div>}

            <button
              onClick={() => (mode === 'create' ? create() : open(path.trim()))}
              disabled={busy || !path.trim()}
              className={btnPrimary}
            >
              {busy ? '处理中…' : mode === 'create' ? '创建项目' : '打开项目'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
