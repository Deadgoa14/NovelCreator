import { create } from 'zustand'
import { api, errorMessage } from './api'
import type { AiConceptCandidate, AiSummarizeItem } from './api'
import { useStore } from './store'
import { uid } from './util'
import type { Beat } from './types'

// Non-blocking AI task queue. Unlike the old modal flow, launching a task only
// adds an entry to a floating panel; the user can keep editing while any number
// of tasks run concurrently in the background.

export type AiTaskKind = 'extract' | 'summarize' | 'continue' | 'polish' | 'proofread'

export interface AiTask {
  id: string
  kind: AiTaskKind
  title: string
  nodeId?: string
  beatIndex?: number
  status: 'running' | 'done' | 'error'
  text: string
  candidates?: AiConceptCandidate[]
  items?: AiSummarizeItem[]
  error?: string
}

interface AiTasksState {
  tasks: AiTask[]
  add: (t: AiTask) => void
  patch: (id: string, p: Partial<AiTask>) => void
  remove: (id: string) => void
  clear: () => void
}

export const useAiTasks = create<AiTasksState>((set) => ({
  tasks: [],
  add: (t) => set((s) => ({ tasks: [t, ...s.tasks] })),
  patch: (id, p) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...p } : t)) })),
  remove: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
  clear: () => set({ tasks: [] }),
}))

const store = () => useAiTasks.getState()

const AI_COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#f032e6', '#008080', '#9a6324']

function spawn(kind: AiTaskKind, title: string, extra: Partial<AiTask> = {}): string {
  const id = uid('task')
  store().add({ id, kind, title, status: 'running', text: '', ...extra })
  return id
}

// Streaming prose generation, with a non-streaming fallback when the stream
// completes but yields no text (some providers drop content over SSE).
async function runStream(
  id: string,
  stream: (onChunk: (t: string) => void) => Promise<void>,
  fallback: () => Promise<{ text: string }>,
) {
  let acc = ''
  try {
    await stream((t) => {
      acc += t
      store().patch(id, { text: acc })
    })
    if (acc.trim()) {
      store().patch(id, { status: 'done' })
      return
    }
  } catch (e) {
    store().patch(id, { status: 'error', error: errorMessage(e) })
    return
  }
  // Stream succeeded but produced nothing → retry via the non-streaming endpoint.
  try {
    const r = await fallback()
    if (r.text && r.text.trim()) {
      store().patch(id, { text: r.text, status: 'done' })
    } else {
      store().patch(id, { status: 'error', error: '生成结果为空，请检查 AI 配置' })
    }
  } catch (e) {
    store().patch(id, { status: 'error', error: errorMessage(e) })
  }
}

export function launchExtract(text: string) {
  const id = spawn('extract', '识别角色')
  ;(async () => {
    try {
      const r = await api.aiExtract('character', text)
      store().patch(id, { candidates: r.items, status: 'done' })
    } catch (e) {
      store().patch(id, { status: 'error', error: errorMessage(e) })
    }
  })()
}

export function launchSummarize(text: string, nodeId: string) {
  const id = spawn('summarize', '提炼梗概', { nodeId })
  ;(async () => {
    try {
      const r = await api.aiSummarize(text)
      store().patch(id, { items: r.beats, status: 'done' })
    } catch (e) {
      store().patch(id, { status: 'error', error: errorMessage(e) })
    }
  })()
}

export function launchContinue(nodeId: string, beatIndex: number) {
  const id = spawn('continue', '续写', { nodeId, beatIndex })
  void runStream(
    id,
    (on) => api.streamContinue(nodeId, beatIndex, on),
    () => api.aiContinue(nodeId, beatIndex),
  )
}

export function launchPolish(nodeId: string, beatIndex: number, body: string) {
  const id = spawn('polish', '润色', { nodeId, beatIndex })
  void runStream(
    id,
    (on) => api.streamPolish(body, on),
    () => api.aiPolish(body),
  )
}

export function launchProofread(nodeId: string, beatIndex: number, body: string) {
  const id = spawn('proofread', '审校', { nodeId, beatIndex })
  void runStream(
    id,
    (on) => api.streamProofread(body, on),
    () => api.aiProofread(body),
  )
}

// Re-read the node list and, if the given node is still the current one, sync
// its beats into the editor store so the UI reflects the change immediately.
async function refreshNodeStore(nodeId: string) {
  const s = useStore.getState()
  s.patchNodes(await api.listNodes())
  if (s.currentNodeId === nodeId) {
    const n = await api.getNode(nodeId)
    s.patchCurrentNode({ beats: n.meta.beats ?? [] })
  }
}

export async function applyTextTask(task: AiTask): Promise<void> {
  if (task.nodeId == null || task.beatIndex == null) throw new Error('任务缺少目标节点')
  const n = await api.getNode(task.nodeId)
  const beats: Beat[] = [...(n.meta.beats ?? [])]
  const beat = beats[task.beatIndex]
  if (!beat) throw new Error('目标梗概已不存在')
  if (task.kind === 'continue') {
    const existing = (beat.body ?? '').trim() ? (beat.body ?? '') + '\n' : ''
    beats[task.beatIndex] = { ...beat, body: existing + task.text }
  } else {
    beats[task.beatIndex] = { ...beat, body: task.text }
  }
  await api.updateNode(task.nodeId, { beats })
  await refreshNodeStore(task.nodeId)
}

export async function importExtract(task: AiTask, indices: number[]): Promise<void> {
  const s = useStore.getState()
  const base = s.concepts.length
  for (const i of indices) {
    const c = task.candidates?.[i]
    if (!c) continue
    await api.createConcept({
      id: '',
      type: 'character',
      name: c.name,
      aliases: c.aliases,
      description: c.description,
      color: AI_COLORS[(base + i) % AI_COLORS.length],
      personality: c.personality,
      background: c.background,
      identity: c.identity,
    })
  }
  const data = await api.getConcepts()
  s.patchConcepts(data.concepts, data.relations)
}

export async function importSummarize(task: AiTask, indices: number[]): Promise<void> {
  if (task.nodeId == null) throw new Error('任务缺少目标节点')
  const items = task.items ?? []
  const newBeats: Beat[] = indices
    .map((i) => {
      const it = items[i]
      return { id: uid('beat'), text: it?.text ?? '', body: it?.body ?? '' }
    })
    .filter((b) => b.text.trim() || b.body.trim())
  if (!newBeats.length) return
  const n = await api.getNode(task.nodeId)
  const beats = [...(n.meta.beats ?? []), ...newBeats]
  await api.updateNode(task.nodeId, { beats })
  await refreshNodeStore(task.nodeId)
}
