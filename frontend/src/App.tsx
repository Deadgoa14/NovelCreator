import { useEffect } from 'react'
import { api } from './api'
import { useStore } from './store'
import { useSettings } from './settings'
import { recentlyEdited } from './editSync'
import { ProjectGate } from './components/ProjectGate'
import { DialogProvider } from './components/Dialog'
import { Sidebar } from './components/Sidebar'
import { EditorPane } from './components/EditorPane'
import { AiTaskPanel } from './components/AiTaskPanel'
import { NodesPage } from './pages/NodesPage'
import { ConceptsPage } from './pages/ConceptsPage'
import { WhiteboardPage } from './pages/WhiteboardPage'
import { RelationsPage } from './pages/RelationsPage'
import { ExportPage } from './pages/ExportPage'
import { SettingsPage } from './pages/SettingsPage'
import { AiSettingsPage } from './pages/AiSettingsPage'
import { RawAnalysisPage } from './pages/RawAnalysisPage'
import { MdImportPage } from './pages/MdImportPage'
import { TxtImportPage } from './pages/TxtImportPage'
import { SyncPage } from './pages/SyncPage'
import { TrashPage } from './pages/TrashPage'
import { TtsPage } from './pages/TtsPage'

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
        setCurrentNode({ id: n.id, title: n.meta.title ?? '', beats: n.meta.beats ?? [], questions: n.meta.questions ?? [] })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [currentNodeId, setCurrentNode])

  // Sync: poll the current node so edits made on another device (e.g. phone) show up
  // here. Skipped while an editor/input is focused, to avoid clobbering local typing.
  useEffect(() => {
    if (!currentNodeId) return
    const id = setInterval(async () => {
      if (recentlyEdited()) return // 刚编辑过，跳过以免覆盖未保存的修改
      const active = document.activeElement as HTMLElement | null
      if (
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable ||
          active.closest?.('.cm-editor'))
      ) {
        return
      }
      try {
        const n = await api.getNode(currentNodeId)
        const cur = useStore.getState().currentNode
        const nextBeats = n.meta.beats ?? []
        const changed =
          !cur ||
          cur.title !== (n.meta.title ?? '') ||
          JSON.stringify(cur.beats ?? []) !== JSON.stringify(nextBeats) ||
          JSON.stringify(cur.questions ?? []) !== JSON.stringify(n.meta.questions ?? [])
        if (changed) {
          setCurrentNode({ id: n.id, title: n.meta.title ?? '', beats: nextBeats, questions: n.meta.questions ?? [] })
        }
      } catch {
        /* ignore */
      }
    }, 2000)
    return () => clearInterval(id)
  }, [currentNodeId, setCurrentNode])

  // Heartbeat so the local server can auto-exit once this page is closed.
  useEffect(() => {
    api.heartbeat().catch(() => {})
    const id = setInterval(() => api.heartbeat().catch(() => {}), 5000)
    return () => clearInterval(id)
  }, [])

  if (!ready)
    return (
      <DialogProvider>
        <ProjectGate />
      </DialogProvider>
    )

  return (
    <DialogProvider>
      <div className="flex h-full">
        <Sidebar />
        <div className="flex-1 flex min-w-0">
          <div className="w-[58%] min-w-[360px] border-r border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
            {activePage === 'raw' && <RawAnalysisPage />}
            {activePage === 'mdimport' && <MdImportPage />}
            {activePage === 'txtimport' && <TxtImportPage />}
            {activePage === 'sync' && <SyncPage />}
            {activePage === 'trash' && <TrashPage />}
            {activePage === 'tts' && <TtsPage />}
            {activePage === 'ai' && <AiSettingsPage />}
            {activePage === 'nodes' && <NodesPage />}
            {activePage === 'whiteboard' && <WhiteboardPage />}
            {activePage === 'concepts' && <ConceptsPage scope="concepts" />}
            {activePage === 'characters' && <ConceptsPage scope="characters" />}
            {activePage === 'relations' && <RelationsPage />}
            {activePage === 'export' && <ExportPage />}
            {activePage === 'settings' && <SettingsPage />}
          </div>
          <div className="flex-1 min-w-[320px] overflow-hidden flex flex-col">
            <EditorPane />
          </div>
        </div>
      </div>
      <AiTaskPanel />
    </DialogProvider>
  )
}
