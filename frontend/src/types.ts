export interface Beat {
  id: string
  text: string
  body?: string
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
}

export interface Relation {
  from: string
  to: string
  label: string
}

export interface Storyline {
  id: string
  name: string
  color: string
  nodes: string[]
}

export interface Volume {
  id: string
  name: string
  intro: string
  body: string
  order: number
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
  }
  body: string
}

export type WhiteboardItem =
  | { type: 'node'; nodeId: string; position: Point }
  | { type: 'start'; storylineId: string; position: Point }

export type RelationsBoardItem = { type: 'character'; conceptId: string; position: Point }

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
  whiteboard: { items: WhiteboardItem[] }
  relationsBoard: { items: RelationsBoardItem[] }
  nodes: NodeSummary[]
}
