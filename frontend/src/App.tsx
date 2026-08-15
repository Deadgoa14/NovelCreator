import { useEffect } from 'react'
import { api } from './api'
import { useStore } from './store'
import { useSettings } from './settings'
import { ProjectGate } from './components/ProjectGate'
import { Sidebar } from './components/Sidebar'
import { PreviewPane } from './components/PreviewPane'
import { NodesPage } from './pages/NodesPage'
import { ConceptsPage } from './pages/ConceptsPage'
import { WhiteboardPage } from './pages/WhiteboardPage'
import { RelationsPage } from './pages/RelationsPage'
import { ExportPage } from './pages/ExportPage'
import { SettingsPage } from './pages/SettingsPage'

export default function App() {
  const ready = useStore((s) => s.ready)
  const activePage = useStore((s) => s.activePage)
  const currentNodeId = useStore((s) => s.currentNodeId)
  const setCurrentNode = useStore((s) => s.setCurrentNode)
  const theme = useSettings((s) => s.theme)

  // Apply day/night theme as a `dark` class on <html>.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // Load the current node's detail into the store so both the editor and preview share it.
  useEffect(() => {
    if (!currentNodeId) {
      setCurrentNode(null)
      return
    }
    let cancelled = false
    api
      .getNode(currentNodeId)
      .then((n) => {
        if (cancelled) return
        setCurrentNode({ id: n.id, title: n.meta.title ?? '', beats: n.meta.beats ?? [] })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [currentNodeId, setCurrentNode])

  // Heartbeat so the local server can auto-exit once this page is closed.
  useEffect(() => {
    api.heartbeat().catch(() => {})
    const id = setInterval(() => api.heartbeat().catch(() => {}), 5000)
    return () => clearInterval(id)
  }, [])

  if (!ready) return <ProjectGate />

  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex-1 flex min-w-0">
        <div className="w-[58%] min-w-[360px] border-r border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
          {activePage === 'nodes' && <NodesPage />}
          {activePage === 'whiteboard' && <WhiteboardPage />}
          {activePage === 'concepts' && <ConceptsPage scope="concepts" />}
          {activePage === 'characters' && <ConceptsPage scope="characters" />}
          {activePage === 'relations' && <RelationsPage />}
          {activePage === 'export' && <ExportPage />}
          {activePage === 'settings' && <SettingsPage />}
        </div>
        <div className="flex-1 min-w-[320px] overflow-hidden flex flex-col">
          <PreviewPane />
        </div>
      </div>
    </div>
  )
}
