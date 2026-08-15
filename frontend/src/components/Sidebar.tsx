import { api } from '../api'
import { useStore, type Page } from '../store'

const TABS: { id: Page; label: string; icon: string }[] = [
  { id: 'nodes', label: '剧情节点', icon: '📄' },
  { id: 'whiteboard', label: '故事线白板', icon: '🗺️' },
  { id: 'concepts', label: '概念', icon: '🏷️' },
  { id: 'characters', label: '人物', icon: '👤' },
  { id: 'relations', label: '人物关系', icon: '🕸️' },
  { id: 'export', label: '导出全篇', icon: '📤' },
  { id: 'settings', label: '设置', icon: '⚙️' },
]

export function Sidebar() {
  const activePage = useStore((s) => s.activePage)
  const setActivePage = useStore((s) => s.setActivePage)
  const projectName = useStore((s) => s.projectName)

  return (
    <aside className="w-40 shrink-0 bg-gray-900 text-gray-100 flex flex-col">
      <div className="px-4 py-4 border-b border-gray-700/70">
        <div className="text-[11px] text-gray-400">当前项目</div>
        <div className="text-sm font-semibold truncate" title={projectName}>
          {projectName}
        </div>
      </div>
      <nav className="flex-1 py-2 overflow-y-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActivePage(t.id)}
            className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors ${
              activePage === t.id ? 'bg-blue-600 text-white' : 'hover:bg-gray-800 text-gray-300'
            }`}
          >
            <span className="text-base leading-none">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      <div className="px-3 py-3 border-t border-gray-700/70">
        <button
          onClick={() => {
            if (window.confirm('退出程序并停止本地服务？')) {
              api.shutdown().catch(() => {})
              // Try to close this tab; browsers may block it for non-script-opened
              // tabs, so fall back to a clear message.
              window.close()
              setTimeout(() => {
                document.body.innerHTML =
                  '<div style="font-family:system-ui,sans-serif;padding:48px;text-align:center;color:#6b7280">本地服务已停止，可关闭此标签页。</div>'
              }, 400)
            }
          }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-red-600 rounded-md transition-colors"
        >
          <span>⏻</span>
          <span>退出</span>
        </button>
      </div>
    </aside>
  )
}
