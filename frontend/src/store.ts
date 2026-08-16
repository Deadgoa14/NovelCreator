import { create } from 'zustand'
import type {
  Beat,
  Concept,
  ExportSettings,
  NodeSummary,
  ProjectData,
  Relation,
  RelationsBoardItem,
  Storyline,
  Volume,
  WhiteboardItem,
} from './types'

export type Page = 'ai' | 'nodes' | 'whiteboard' | 'concepts' | 'characters' | 'relations' | 'export' | 'settings'

export interface CurrentNode {
  id: string
  title: string
  beats: Beat[]
}

interface AppState {
  projectPath: string | null
  projectName: string
  concepts: Concept[]
  relations: Relation[]
  storylines: Storyline[]
  volumes: Volume[]
  whiteboard: WhiteboardItem[]
  relationsBoard: RelationsBoardItem[]
  nodes: NodeSummary[]
  exportSettings: ExportSettings
  activePage: Page
  currentNodeId: string | null
  currentNode: CurrentNode | null
  currentVolumeId: string | null
  focusBeat: { nodeId: string; beatId: string; nonce: number } | null
  ready: boolean

  setProject: (data: ProjectData, path: string) => void
  resetProject: () => void
  setActivePage: (p: Page) => void
  setCurrentNodeId: (id: string | null) => void
  setCurrentVolumeId: (id: string | null) => void
  setCurrentNode: (n: CurrentNode | null) => void
  requestFocusBeat: (nodeId: string, beatId: string) => void
  patchCurrentNode: (patch: Partial<CurrentNode>) => void
  patchConcepts: (concepts: Concept[], relations: Relation[]) => void
  patchStorylines: (storylines: Storyline[]) => void
  patchVolumes: (volumes: Volume[]) => void
  patchWhiteboard: (whiteboard: WhiteboardItem[]) => void
  patchRelationsBoard: (relationsBoard: RelationsBoardItem[]) => void
  patchNodes: (nodes: NodeSummary[]) => void
  patchExportSettings: (exportSettings: ExportSettings) => void
}

export const useStore = create<AppState>((set) => ({
  projectPath: null,
  projectName: '',
  concepts: [],
  relations: [],
  storylines: [],
  volumes: [],
  whiteboard: [],
  relationsBoard: [],
  nodes: [],
  exportSettings: { indentParagraph: true, paragraphGap: 0, chapterHeadBlank: 0, chapterTailBlank: 0 },
  activePage: 'nodes',
  currentNodeId: null,
  currentNode: null,
  currentVolumeId: null,
  focusBeat: null,
  ready: false,

  setProject: (data, path) =>
    set({
      projectPath: path,
      projectName: data.project.name,
      concepts: data.concepts.concepts,
      relations: data.concepts.relations,
      storylines: data.storylines.storylines,
      volumes: data.volumes,
      whiteboard: data.whiteboard.items,
      relationsBoard: data.relationsBoard.items,
      nodes: data.nodes,
      exportSettings: data.exportSettings,
      currentNodeId: data.nodes[0]?.id ?? null,
      ready: true,
      activePage: 'nodes',
    }),
  resetProject: () =>
    set({
      ready: false,
      projectPath: null,
      projectName: '',
      concepts: [],
      relations: [],
      storylines: [],
      volumes: [],
      whiteboard: [],
      relationsBoard: [],
      nodes: [],
      currentNodeId: null,
      currentNode: null,
      currentVolumeId: null,
      activePage: 'nodes',
    }),
  setActivePage: (p) => set({ activePage: p }),
  setCurrentNodeId: (id) => set({ currentNodeId: id }),
  setCurrentVolumeId: (id) => set({ currentVolumeId: id }),
  setCurrentNode: (n) => set({ currentNode: n }),
  requestFocusBeat: (nodeId, beatId) => set({ focusBeat: { nodeId, beatId, nonce: Math.random() } }),
  patchCurrentNode: (patch) => set((s) => (s.currentNode ? { currentNode: { ...s.currentNode, ...patch } } : {})),
  patchConcepts: (concepts, relations) => set({ concepts, relations }),
  patchStorylines: (storylines) => set({ storylines }),
  patchVolumes: (volumes) => set({ volumes }),
  patchWhiteboard: (whiteboard) => set({ whiteboard }),
  patchRelationsBoard: (relationsBoard) => set({ relationsBoard }),
  patchNodes: (nodes) => set({ nodes }),
  patchExportSettings: (exportSettings) => set({ exportSettings }),
}))
