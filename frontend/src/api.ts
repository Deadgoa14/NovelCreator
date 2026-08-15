import type { Beat, Concept, ExportSettings, NodeDetail, NodeSummary, Point, ProjectData, Relation, Storyline, Volume } from './types'

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

export type ReorderItem = { type: 'node' | 'volume'; id: string }

export const api = {
  createProject: (path: string, name: string) =>
    request<ProjectData>('/api/projects/create', { method: 'POST', body: JSON.stringify({ path, name }) }),
  openProject: (path: string) =>
    request<ProjectData>('/api/projects/open', { method: 'POST', body: JSON.stringify({ path }) }),
  getProject: () => request<ProjectData>('/api/project'),

  listNodes: () => request<NodeSummary[]>('/api/nodes'),
  createNode: () => request<NodeDetail>('/api/nodes', { method: 'POST' }),
  getNode: (id: string) => request<NodeDetail>(`/api/nodes/${id}`),
  updateNode: (id: string, meta: Partial<{ title: string; beats: Beat[]; characters: string[]; order: number }>) =>
    request<NodeDetail>(`/api/nodes/${id}`, { method: 'PUT', body: JSON.stringify(meta) }),
  saveBody: (id: string, body: string) =>
    request<NodeDetail>(`/api/nodes/${id}/body`, { method: 'PUT', body: JSON.stringify({ body }) }),
  deleteNode: (id: string) => request<{ ok: boolean }>(`/api/nodes/${id}`, { method: 'DELETE' }),

  listVolumes: () => request<Volume[]>('/api/volumes'),
  createVolume: () => request<Volume>('/api/volumes', { method: 'POST', body: JSON.stringify({}) }),
  updateVolume: (id: string, patch: Partial<{ name: string; intro: string; body: string }>) =>
    request<Volume>(`/api/volumes/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deleteVolume: (id: string) => request<{ ok: boolean }>(`/api/volumes/${id}`, { method: 'DELETE' }),

  reorderItems: (items: ReorderItem[]) =>
    request<{ nodes: NodeSummary[]; volumes: Volume[] }>('/api/items/reorder', {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),

  getConcepts: () => request<{ concepts: Concept[]; relations: Relation[] }>('/api/concepts'),
  createConcept: (c: Concept) => request<Concept>('/api/concepts', { method: 'POST', body: JSON.stringify(c) }),
  updateConcept: (id: string, c: Concept) =>
    request<Concept>(`/api/concepts/${id}`, { method: 'PUT', body: JSON.stringify(c) }),
  deleteConcept: (id: string) => request<{ ok: boolean }>(`/api/concepts/${id}`, { method: 'DELETE' }),
  renameConcept: (id: string, newName: string, apply: boolean) =>
    request<{ affected: { id: string; title: string; count: number }[]; total: number }>(
      `/api/concepts/${id}/rename`,
      { method: 'POST', body: JSON.stringify({ newName, apply }) },
    ),

  getStorylines: () => request<{ storylines: Storyline[] }>('/api/storylines'),
  createStoryline: (s: Storyline) => request<Storyline>('/api/storylines', { method: 'POST', body: JSON.stringify(s) }),
  updateStoryline: (id: string, s: Storyline) =>
    request<Storyline>(`/api/storylines/${id}`, { method: 'PUT', body: JSON.stringify(s) }),
  deleteStoryline: (id: string) => request<{ ok: boolean }>(`/api/storylines/${id}`, { method: 'DELETE' }),

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

  export: (
    storylineId: string,
    opts: { indentParagraph: boolean; paragraphGap: number; chapterHeadBlank: number; chapterTailBlank: number },
  ) =>
    request<{ filename: string; content: string; charCount: number }>('/api/export', {
      method: 'POST',
      body: JSON.stringify({ storylineId, format: 'txt', ...opts }),
    }),

  saveExportSettings: (s: ExportSettings) =>
    request<ExportSettings>('/api/export-settings', { method: 'PUT', body: JSON.stringify(s) }),

  shutdown: () => request<{ ok: boolean }>('/api/shutdown', { method: 'POST' }),
  heartbeat: () => request<{ ok: boolean }>('/api/heartbeat', { method: 'POST' }),
}
