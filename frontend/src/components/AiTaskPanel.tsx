import { useEffect, useRef, useState } from 'react'
import { applyTextTask, importExtract, importSummarize, useAiTasks } from '../aiTasks'
import type { AiTask } from '../aiTasks'
import { errorMessage } from '../api'
import { ProgressBar } from './ProgressBar'
import { DiffView } from './DiffView'

const APPLY_LABEL: Record<string, string> = {
  continue: '追加到正文',
  polish: '替换正文',
  proofread: '替换正文',
}

const checkCls = 'mt-0.5 accent-blue-600'

function TaskCard({ task, onRemove }: { task: AiTask; onRemove: () => void }) {
  const patch = useAiTasks((s) => s.patch)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [showDiff, setShowDiff] = useState(false)
  const taRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const el = taRef.current
    if (el && task.status === 'running') el.scrollTop = el.scrollHeight
  }, [task.text, task.status])

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  async function apply() {
    setBusy(true)
    try {
      await applyTextTask(task)
      onRemove()
    } catch (e) {
      patch(task.id, { error: errorMessage(e) })
      setBusy(false)
    }
  }

  async function importSelected() {
    const idx = [...selected].sort((a, b) => a - b)
    if (idx.length === 0) return
    setBusy(true)
    try {
      if (task.kind === 'extract') await importExtract(task, idx)
      else await importSummarize(task, idx)
      onRemove()
    } catch (e) {
      patch(task.id, { error: errorMessage(e) })
      setBusy(false)
    }
  }

  const statusBadge =
    task.status === 'running' ? (
      <span className="text-[10px] text-blue-500 animate-pulse">生成中…</span>
    ) : task.status === 'error' ? (
      <span className="text-[10px] text-red-500">失败</span>
    ) : (
      <span className="text-[10px] text-emerald-500">完成</span>
    )

  const isList = task.kind === 'extract' || task.kind === 'summarize'

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-700 dark:text-gray-200">{task.title}</span>
          {statusBadge}
        </div>
        <button onClick={onRemove} className="text-gray-300 hover:text-red-500 text-sm" title="关闭">
          ✕
        </button>
      </div>

      {task.status === 'running' && <ProgressBar className="mb-1.5" />}

      {task.error && <div className="text-xs text-red-500 mb-1 whitespace-pre-wrap">{task.error}</div>}

      {isList ? (
        <div className="space-y-1">
          <div className="max-h-[220px] overflow-y-auto space-y-1">
            {task.kind === 'extract' &&
              (task.candidates ?? []).map((c, i) => (
                <label key={i} className="flex items-start gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} className={checkCls} />
                  <span className="flex-1 text-gray-700 dark:text-gray-200">
                    {c.name || '（空）'}
                    {c.description && <span className="text-gray-400"> · {c.description}</span>}
                  </span>
                </label>
              ))}
            {task.kind === 'summarize' &&
              (task.items ?? []).map((it, i) => (
                <label key={i} className="flex items-start gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} className={checkCls} />
                  <span className="flex-1 min-w-0 text-gray-700 dark:text-gray-200">
                    <span className="block">{it.text || '（空）'}</span>
                    {it.body && <span className="block text-gray-400 truncate">{it.body.slice(0, 60)}</span>}
                  </span>
                </label>
              ))}
          </div>
          {task.status === 'done' && (
            <button
              onClick={importSelected}
              disabled={busy || selected.size === 0}
              className="mt-1.5 px-2.5 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
            >
              导入选中（{selected.size}）
            </button>
          )}
        </div>
      ) : (
        <>
          <textarea
            ref={taRef}
            value={task.text}
            onChange={(e) => patch(task.id, { text: e.target.value })}
            readOnly={task.status === 'running'}
            rows={4}
            placeholder={task.status === 'running' ? '生成中…' : ''}
            className="w-full text-xs border border-gray-200 dark:border-gray-600 rounded-md p-2 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 resize-y focus:outline-none"
          />
          {task.status === 'done' && task.text.trim() && (
            <div className="mt-1.5 flex items-center gap-2">
              <button
                onClick={apply}
                disabled={busy}
                className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
              >
                {APPLY_LABEL[task.kind] ?? '应用'}
              </button>
              {task.kind === 'polish' && task.original != null && (
                <button
                  onClick={() => setShowDiff((v) => !v)}
                  className={`px-2.5 py-1 text-xs rounded border ${
                    showDiff
                      ? 'border-blue-400 text-blue-600 dark:text-blue-400'
                      : 'border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600 dark:border-gray-600 dark:text-gray-300 dark:hover:text-blue-400'
                  }`}
                >
                  {showDiff ? '收起对比' : '对比'}
                </button>
              )}
            </div>
          )}
          {task.kind === 'polish' && showDiff && task.original != null && (
            <DiffView oldText={task.original} newText={task.text} />
          )}
        </>
      )}
    </div>
  )
}

export function AiTaskPanel() {
  const tasks = useAiTasks((s) => s.tasks)
  const remove = useAiTasks((s) => s.remove)
  const clear = useAiTasks((s) => s.clear)
  const [collapsed, setCollapsed] = useState(false)

  if (tasks.length === 0) return null

  const running = tasks.filter((t) => t.status === 'running').length

  return (
    <div className="fixed bottom-4 right-4 z-[200] w-[400px] max-w-[92vw] flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
          <span>AI 任务</span>
          {running > 0 && <span className="text-xs text-blue-500 animate-pulse">{running} 个进行中…</span>}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="px-2 py-0.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            {collapsed ? '展开' : '收起'}
          </button>
          <button onClick={clear} className="px-2 py-0.5 text-xs text-gray-400 hover:text-red-500">
            清空
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="max-h-[60vh] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} onRemove={() => remove(t.id)} />
          ))}
        </div>
      )}
    </div>
  )
}
