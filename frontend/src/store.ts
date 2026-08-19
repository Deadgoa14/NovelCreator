import { create } from 'zustand'
import type {
  Beat,
  Concept,
  ConceptType,
  Connection,
  ExportSettings,
  NodeSummary,
  ProjectData,
  Question,
  Relation,
  RelationsBoardItem,
  Storyline,
  Volume,
  WhiteboardItem,
} from './types'

export type Page = 'raw' | 'mdimport' | 'ai' | 'nodes' | 'whiteboard' | 'concepts' | 'characters' | 'relations' | 'export' | 'settings'

export interface CurrentNode {
  id: string
  title: string
  beats: Beat[]
  questions: Question[]
}

interface AppState {
  projectPath: string | null
  projectName: string
  concepts: Concept[]
  relations: Relation[]
  storylines: Storyline[]
  volumes: Volume[]
  connections: Connection[]
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
  skipAutoOpen: boolean
  newConceptRequest: { type: ConceptType; name: string; nonce: number } | null

  setProject: (data: ProjectData, path: string) => void
  resetProject: () => void
  consumeSkipAutoOpen: () => void
  setActivePage: (p: Page) => void
  setCurrentNodeId: (id: string | null) => void
  setCurrentVolumeId: (id: string | null) => void
  setCurrentNode: (n: CurrentNode | null) => void
  requestFocusBeat: (nodeId: string, beatId: string) => void
  patchCurrentNode: (patch: Partial<CurrentNode>) => void
  patchConcepts: (concepts: Concept[], relations: Relation[]) => void
  patchStorylines: (storylines: Storyline[]) => void
  patchVolumes: (volumes: Volume[]) => void
  patchConnections: (connections: Connection[]) => void
  patchWhiteboard: (whiteboard: WhiteboardItem[]) => void
  patchRelationsBoard: (relationsBoard: RelationsBoardItem[]) => void
  patchNodes: (nodes: NodeSummary[]) => void
  patchExportSettings: (exportSettings: ExportSettings) => void
  requestNewConcept: (type: ConceptType, name: string) => void
  consumeNewConceptRequest: () => void
}

export const useStore = create<AppState>((set) => ({
  projectPath: null,
  projectName: '',
  concepts: [],
  relations: [],
  storylines: [],
  volumes: [],
  connections: [],
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
  skipAutoOpen: false,
  newConceptRequest: null,

  setProject: (data, path) =>
    set({
      projectPath: path,
      projectName: data.project.name,
      concepts: data.concepts.concepts,
      relations: data.concepts.relations,
      storylines: data.storylines.storylines,
      volumes: data.volumes,
      connections: data.connections,
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
      skipAutoOpen: true,
      projectPath: null,
      projectName: '',
      concepts: [],
      relations: [],
      storylines: [],
      volumes: [],
      connections: [],
      whiteboard: [],
      relationsBoard: [],
      nodes: [],
      currentNodeId: null,
      currentNode: null,
      currentVolumeId: null,
      activePage: 'nodes',
    }),
  consumeSkipAutoOpen: () => set({ skipAutoOpen: false }),
  setActivePage: (p) => set({ activePage: p }),
  setCurrentNodeId: (id) => set({ currentNodeId: id }),
  setCurrentVolumeId: (id) => set({ currentVolumeId: id }),
  setCurrentNode: (n) => set({ currentNode: n }),
  requestFocusBeat: (nodeId, beatId) => set({ focusBeat: { nodeId, beatId, nonce: Math.random() } }),
  patchCurrentNode: (patch) => set((s) => (s.currentNode ? { currentNode: { ...s.currentNode, ...patch } } : {})),
  patchConcepts: (concepts, relations) => set({ concepts, relations }),
  patchStorylines: (storylines) => set({ storylines }),
  patchVolumes: (volumes) => set({ volumes }),
  patchConnections: (connections) => set({ connections }),
  patchWhiteboard: (whiteboard) => set({ whiteboard }),
  patchRelationsBoard: (relationsBoard) => set({ relationsBoard }),
  patchNodes: (nodes) => set({ nodes }),
  patchExportSettings: (exportSettings) => set({ exportSettings }),
  requestNewConcept: (type, name) => set({ newConceptRequest: { type, name, nonce: Math.random() } }),
  consumeNewConceptRequest: () => set({ newConceptRequest: null }),
}))
