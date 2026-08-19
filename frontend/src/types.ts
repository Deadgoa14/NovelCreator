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

export interface StorylineEdge {
  from: string
  to: string
  active: boolean
}

export interface Connection {
  id: string
  from: string
  to: string
  active: boolean
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
