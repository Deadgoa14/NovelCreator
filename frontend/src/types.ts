export interface Beat {
  id: string
  text: string
  body?: string
  notes?: string[]
}

export interface Question {
  id: string
  text: string
  answer?: string
}

export interface Point {
  x: number
  y: number
}

export type ConceptType = 'generic' | 'character' | 'place' | 'item'

export interface Concept {
  id: string
  type: ConceptType
  name: string
  aliases: string[]
  description: string
  color: string
  personality?: string
  background?: string
  identity?: string
  category?: string
  tags?: string[]
}

export interface Relation {
  from: string
  to: string
  label: string
  sourceHandle?: string
  targetHandle?: string
}

export interface Connection {
  id: string
  from: string
  to: string
}

export interface TrashEntry {
  id: string
  text: string
  nodeId: string
  beatId: string
  createdAt: string
}

export interface Storyline {
  id: string
  name: string
  color: string
}

export interface Volume {
  id: string
  name: string
  intro: string
  body: string
  chapters: string[]
}

export interface NodeSummary {
  id: string
  title: string
  order: number
  beatCount: number
  characterCount: number
  characters: string[]
  beats: Beat[]
}

export interface NodeDetail {
  id: string
  meta: {
    id: string
    title: string
    order?: number
    beats: Beat[]
    characters: string[]
    questions?: Question[]
  }
  body: string
}

export type WhiteboardItem =
  | { type: 'node'; nodeId: string; position: Point }
  | { type: 'start'; storylineId: string; position: Point }
  | { type: 'volume'; volumeId: string; position: Point }
  | { type: 'volumeStart'; volumeId: string; position: Point }
  | { type: 'volumeEnd'; volumeId: string; position: Point }

export type RelationsBoardItem = { type: 'character'; conceptId: string; position: Point }

export interface ExportSettings {
  indentParagraph: boolean
  paragraphGap: number
  chapterHeadBlank: number
  chapterTailBlank: number
}

export type SyncEntryState =
  | 'app-new'
  | 'md-new'
  | 'app-changed'
  | 'md-changed'
  | 'conflict'
  | 'md-deleted'
  | 'app-deleted'
  | 'md-moved'
  | 'converged'
  | 'unchanged'
  | 'error'
  | 'ignored'

export type SyncAction =
  | 'export'
  | 'import'
  | 'keep-app'
  | 'keep-md'
  | 'delete-app'
  | 'delete-md'
  | 'acknowledge'
  | 'skip'
  | 'ignore-md'

export interface SyncSummary {
  title?: string
  name?: string
  order?: number
  volume?: string
  beatCount?: number
  beats?: string[]
  type?: string
  aliases?: string[]
  description?: string
}

export interface SyncEntry {
  key: string
  kind: 'chapter' | 'concept'
  entityId: string
  state: SyncEntryState
  defaultAction: SyncAction
  name: string
  path: string
  appHash: string | null
  mdHash: string | null
  appSummary: SyncSummary | null
  mdSummary: SyncSummary | null
  warnings: string[]
}

export interface SyncScanResult {
  mdRoot: string
  lastSyncAt: string
  entries: SyncEntry[]
  counts: Record<string, number>
  warnings: string[]
}

export interface SyncSettings {
  mdRoot: string
  lastSyncAt: string
  valid: boolean
  entryCount: number
}

export interface SyncDecision {
  key: string
  action: SyncAction
  expectedAppHash: string | null
  expectedMdHash: string | null
}

export interface SyncApplyResult {
  applied: number
  skipped: number
  errors: { key: string; message: string }[]
  stale: { key: string; message: string }[]
  warnings: string[]
  project: ProjectData
}

export interface ProjectData {
  project: {
    schemaVersion: number
    name: string
    createdAt: string
    updatedAt: string
  }
  concepts: { concepts: Concept[]; relations: Relation[] }
  storylines: { storylines: Storyline[] }
  volumes: Volume[]
  connections: Connection[]
  whiteboard: { items: WhiteboardItem[] }
  relationsBoard: { items: RelationsBoardItem[] }
  nodes: NodeSummary[]
  exportSettings: ExportSettings
}
