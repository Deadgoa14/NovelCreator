import type { Beat, Concept, Connection, ExportSettings, NodeDetail, NodeSummary, Point, ProjectData, Question, Relation, Storyline, Volume } from './types'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const j = await res.json()
      if (j?.detail) detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
    } catch {
      /* ignore */
    }
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

// Stream a plain-text response from the backend, invoking onChunk for each
// decoded fragment. Errors (non-2xx) throw before any chunk is emitted.
async function streamRequest(path: string, body: unknown, onChunk: (text: string) => void): Promise<void> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const j = await res.json()
      if (j?.detail) detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
    } catch {
      /* ignore */
    }
    throw new Error(detail)
  }
  if (!res.body) throw new Error('无响应流')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    onChunk(decoder.decode(value, { stream: true }))
  }
}

export interface AiConfig {
  baseURL: string
  apiKey: string
  model: string
}

export interface AiConceptCandidate {
  name: string
  aliases: string[]
  description: string
  identity: string
  personality: string
  background: string
}

export interface AiSummarizeItem {
  text: string
  body: string
}

export interface RawCharacter {
  name: string
  aliases: string[]
  identity: string
  personality: string
  background: string
  description: string
}

export interface RawConcept {
  name: string
  aliases: string[]
  type: 'place' | 'item' | 'generic'
  description: string
}

export interface RawWorldbuilding {
  name: string
  description: string
}

export interface RawBeat {
  text: string
  body: string
}

export interface RawAnalysis {
  title: string
  summary: string
  worldbuilding: RawWorldbuilding[]
  characters: RawCharacter[]
  concepts: RawConcept[]
  beats: RawBeat[]
}

export interface RecentProject {
  path: string
  name: string
  lastOpened: string
}

export interface AiUsageByModel {
  model: string
  requests: number
  input: number
  output: number
  cost: number
}

export interface AiUsageDaily {
  date: string
  requests: number
  input: number
  output: number
  cost: number
}

export interface AiUsage {
  totalRequests: number
  totalInput: number
  totalOutput: number
  totalCost: number
  byModel: AiUsageByModel[]
  daily: AiUsageDaily[]
}

export const api = {
  createProject: (path: string, name: string) =>
    request<ProjectData>('/api/projects/create', { method: 'POST', body: JSON.stringify({ path, name }) }),
  openProject: (path: string) =>
    request<ProjectData>('/api/projects/open', { method: 'POST', body: JSON.stringify({ path }) }),
  getProject: () => request<ProjectData>('/api/project'),
  getRecent: () => request<{ recent: RecentProject[]; lastPath: string }>('/api/projects/recent'),
  removeRecent: (path: string) =>
    request<{ recent: RecentProject[]; lastPath: string }>('/api/projects/recent/remove', {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),
  pickDirectory: () => request<{ path: string }>('/api/picker/dir', { method: 'POST' }),

  listNodes: () => request<NodeSummary[]>('/api/nodes'),
  createNode: () => request<NodeDetail>('/api/nodes', { method: 'POST' }),
  getNode: (id: string) => request<NodeDetail>(`/api/nodes/${id}`),
  updateNode: (
    id: string,
    meta: Partial<{ title: string; beats: Beat[]; characters: string[]; order: number; questions: Question[] }>,
  ) => request<NodeDetail>(`/api/nodes/${id}`, { method: 'PUT', body: JSON.stringify(meta) }),
  saveBody: (id: string, body: string) =>
    request<NodeDetail>(`/api/nodes/${id}/body`, { method: 'PUT', body: JSON.stringify({ body }) }),
  deleteNode: (id: string) => request<{ ok: boolean }>(`/api/nodes/${id}`, { method: 'DELETE' }),

  listVolumes: () => request<Volume[]>('/api/volumes'),
  createVolume: (name = '') => request<Volume>('/api/volumes', { method: 'POST', body: JSON.stringify({ name }) }),
  updateVolume: (id: string, patch: Partial<{ name: string; intro: string; body: string; chapters: string[] }>) =>
    request<Volume>(`/api/volumes/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  setVolumeChapters: (id: string, chapters: string[]) =>
    request<Volume>(`/api/volumes/${id}/chapters`, { method: 'PUT', body: JSON.stringify({ chapters }) }),
  deleteVolume: (id: string) => request<{ ok: boolean }>(`/api/volumes/${id}`, { method: 'DELETE' }),

  reorderNodes: (ids: string[]) =>
    request<NodeSummary[]>('/api/nodes/reorder', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  getConcepts: () => request<{ concepts: Concept[]; relations: Relation[] }>('/api/concepts'),
  createConcept: (c: Concept) => request<Concept>('/api/concepts', { method: 'POST', body: JSON.stringify(c) }),
  updateConcept: (id: string, c: Concept) =>
    request<Concept>(`/api/concepts/${id}`, { method: 'PUT', body: JSON.stringify(c) }),
  deleteConcept: (id: string) => request<{ ok: boolean }>(`/api/concepts/${id}`, { method: 'DELETE' }),
  renameConcept: (id: string, oldTerm: string, newTerm: string, apply: boolean) =>
    request<{ affected: { id: string; title: string; count: number }[]; total: number }>(
      `/api/concepts/${id}/rename`,
      { method: 'POST', body: JSON.stringify({ oldTerm, newTerm, apply }) },
    ),

  getStorylines: () => request<{ storylines: Storyline[] }>('/api/storylines'),
  createStoryline: (s: Storyline) => request<Storyline>('/api/storylines', { method: 'POST', body: JSON.stringify(s) }),
  updateStoryline: (id: string, s: Storyline) =>
    request<Storyline>(`/api/storylines/${id}`, { method: 'PUT', body: JSON.stringify(s) }),
  deleteStoryline: (id: string) => request<{ ok: boolean }>(`/api/storylines/${id}`, { method: 'DELETE' }),

  getConnections: () => request<{ connections: Connection[] }>('/api/connections'),
  createConnection: (from: string, to: string) =>
    request<Connection | { ok: boolean }>('/api/connections', { method: 'POST', body: JSON.stringify({ from, to }) }),
  deleteConnection: (id: string) => request<{ ok: boolean }>(`/api/connections/${id}`, { method: 'DELETE' }),
  setConnectionActive: (id: string) => request<{ ok: boolean }>(`/api/connections/${id}/active`, { method: 'PUT' }),

  saveRelations: (relations: Relation[]) =>
    request<{ ok: boolean }>('/api/relations', { method: 'PUT', body: JSON.stringify({ relations }) }),

  setNodePosition: (nodeId: string, position: Point) =>
    request<{ ok: boolean }>(`/api/board/node/${nodeId}/position`, { method: 'PUT', body: JSON.stringify(position) }),
  setStartPosition: (storylineId: string, position: Point) =>
    request<{ ok: boolean }>(`/api/board/start/${storylineId}/position`, { method: 'PUT', body: JSON.stringify(position) }),
  setCharacterPosition: (conceptId: string, position: Point) =>
    request<{ ok: boolean }>(`/api/board/character/${conceptId}/position`, {
      method: 'PUT',
      body: JSON.stringify(position),
    }),
  setVolumePosition: (volumeId: string, position: Point) =>
    request<{ ok: boolean }>(`/api/board/volume/${volumeId}/position`, {
      method: 'PUT',
      body: JSON.stringify(position),
    }),
  setVolumeTerminalPosition: (volumeId: string, terminal: 'start' | 'end', position: Point) =>
    request<{ ok: boolean }>(`/api/board/volume/${volumeId}/${terminal}/position`, {
      method: 'PUT',
      body: JSON.stringify(position),
    }),

  export: (
    storylineId: string,
    opts: {
      indentParagraph: boolean
      paragraphGap: number
      chapterHeadBlank: number
      chapterTailBlank: number
      chapterNumberingPerVolume: boolean
    },
  ) =>
    request<{ filename: string; content: string; charCount: number }>('/api/export', {
      method: 'POST',
      body: JSON.stringify({ storylineId, format: 'txt', ...opts }),
    }),
  exportNode: (
    nodeId: string,
    opts: {
      indentParagraph: boolean
      paragraphGap: number
      chapterHeadBlank: number
      chapterTailBlank: number
      chapterNumberingPerVolume: boolean
    },
  ) =>
    request<{ filename: string; content: string; charCount: number }>('/api/export', {
      method: 'POST',
      body: JSON.stringify({ nodeId, format: 'txt', ...opts }),
    }),

  saveExportSettings: (s: ExportSettings) =>
    request<ExportSettings>('/api/export-settings', { method: 'PUT', body: JSON.stringify(s) }),
  exportData: (kind: 'concepts' | 'characters' | 'outlines', format: 'txt' | 'md') =>
    request<{ filename: string; content: string }>('/api/export/data', {
      method: 'POST',
      body: JSON.stringify({ kind, format }),
    }),

  shutdown: () => request<{ ok: boolean }>('/api/shutdown', { method: 'POST' }),
  heartbeat: () => request<{ ok: boolean }>('/api/heartbeat', { method: 'POST' }),

  getAiConfig: () => request<AiConfig>('/api/ai/config'),
  saveAiConfig: (c: AiConfig) => request<AiConfig>('/api/ai/config', { method: 'PUT', body: JSON.stringify(c) }),
  aiTest: () => request<{ ok: boolean }>('/api/ai/test', { method: 'POST' }),
  aiExtract: (type: string, text: string) =>
    request<{ items: AiConceptCandidate[] }>('/api/ai/extract', { method: 'POST', body: JSON.stringify({ type, text }) }),
  aiSummarize: (text: string, chunkChars: number) =>
    request<{ beats: AiSummarizeItem[] }>('/api/ai/summarize', {
      method: 'POST',
      body: JSON.stringify({ text, chunkChars }),
    }),
  analyzeRaw: (text: string) =>
    request<RawAnalysis>('/api/ai/analyze-raw', { method: 'POST', body: JSON.stringify({ text }) }),
  aiContinue: (nodeId: string, beatIndex: number, notes: string[] = []) =>
    request<{ text: string }>('/api/ai/continue', { method: 'POST', body: JSON.stringify({ nodeId, beatIndex, notes }) }),
  resolveQuestions: (nodeId: string, questions: string[]) =>
    request<{ answers: string[] }>('/api/ai/resolve-questions', {
      method: 'POST',
      body: JSON.stringify({ nodeId, questions }),
    }),
  aiBeat: (nodeId: string) => request<{ text: string }>('/api/ai/beat', { method: 'POST', body: JSON.stringify({ nodeId }) }),
  aiPolish: (text: string) => request<{ text: string }>('/api/ai/polish', { method: 'POST', body: JSON.stringify({ text }) }),
  aiProofread: (text: string) =>
    request<{ text: string }>('/api/ai/proofread', { method: 'POST', body: JSON.stringify({ text }) }),
  streamContinue: (nodeId: string, beatIndex: number, notes: string[], onChunk: (text: string) => void) =>
    streamRequest('/api/ai/stream/continue', { nodeId, beatIndex, notes }, onChunk),
  streamPolish: (text: string, onChunk: (text: string) => void) =>
    streamRequest('/api/ai/stream/polish', { text }, onChunk),
  streamProofread: (text: string, onChunk: (text: string) => void) =>
    streamRequest('/api/ai/stream/proofread', { text }, onChunk),
  getAiUsage: () => request<AiUsage>('/api/ai/usage'),
  resetAiUsage: () => request<AiUsage>('/api/ai/usage/reset', { method: 'POST' }),
}
