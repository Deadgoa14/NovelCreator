import { useEffect, useMemo, useState } from 'react'
import { api, errorMessage } from '../api'
import { useStore } from '../store'
import { useDialog } from '../components/Dialog'
import { recentlyEdited } from '../editSync'
import type {
  SyncAction,
  SyncDecision,
  SyncEntry,
  SyncEntryState,
  SyncScanResult,
  SyncSettings,
  SyncSummary,
} from '../types'

const GROUPS: { state: SyncEntryState; label: string; hint: string; tone: string }[] = [
  { state: 'conflict', label: '冲突', hint: '两边都改过，需要选择保留哪边', tone: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  { state: 'md-new', label: 'Markdown 新增', hint: '只在 Markdown 里存在', tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  { state: 'app-new', label: 'App 新增', hint: '只在 App 里存在', tone: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  { state: 'md-changed', label: 'Markdown 已修改', hint: '可以导入到 App', tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  { state: 'app-changed', label: 'App 已修改', hint: '可以写入 Markdown', tone: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  { state: 'md-deleted', label: 'App 有、Markdown 没有', hint: 'Markdown 文件被删除或移动了', tone: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  { state: 'app-deleted', label: 'Markdown 有、App 没有', hint: 'App 里已删除，Markdown 还留着', tone: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  { state: 'md-moved', label: 'Markdown 文件已移动', hint: '内容没变，只记录新路径', tone: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  { state: 'converged', label: '两边已一致', hint: '内容相同，记录为已同步即可', tone: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  { state: 'error', label: '无法解析', hint: '文件格式有问题，不会写入', tone: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  { state: 'ignored', label: '已忽略', hint: '不会导入这个文件', tone: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
  { state: 'unchanged', label: '无变化', hint: '', tone: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
]

const STATE_BY_KEY = new Map(GROUPS.map((g) => [g.state, g]))

const TYPE_LABELS: Record<string, string> = {
  character: '人物',
  place: '地点',
  item: '物品',
  generic: '通用',
}

function optionsFor(entry: SyncEntry): { value: SyncAction; label: string }[] {
  switch (entry.state) {
    case 'conflict':
      return [
        { value: 'keep-app', label: '保留 App 版本（覆盖 Markdown）' },
        { value: 'keep-md', label: '保留 Markdown 版本（覆盖 App）' },
        { value: 'skip', label: '跳过' },
      ]
    case 'md-deleted':
      return [
        { value: 'export', label: '重新生成 Markdown' },
        { value: 'delete-app', label: '删除 App 中这一项' },
        { value: 'skip', label: '跳过' },
      ]
    case 'app-deleted':
      return [
        { value: 'import', label: '从 Markdown 恢复到 App' },
        { value: 'delete-md', label: '删除 Markdown 中这一项' },
        { value: 'skip', label: '跳过' },
      ]
    case 'md-new':
    case 'md-changed':
      return [
        { value: 'import', label: '导入到 App' },
        { value: 'skip', label: '跳过' },
        ...(entry.kind === 'chapter' ? [{ value: 'ignore-md' as SyncAction, label: '忽略这个文件' }] : []),
      ]
    case 'app-new':
    case 'app-changed':
      return [
        { value: 'export', label: '写入 Markdown' },
        { value: 'skip', label: '跳过' },
      ]
    case 'md-moved':
      return [
        { value: 'acknowledge', label: '记录新路径' },
        { value: 'skip', label: '跳过' },
      ]
    case 'converged':
      return [
        { value: 'acknowledge', label: '记录为已同步' },
        { value: 'skip', label: '跳过' },
      ]
    case 'error':
      return [
        { value: 'skip', label: '跳过' },
        ...(entry.kind === 'chapter' ? [{ value: 'ignore-md' as SyncAction, label: '忽略这个文件' }] : []),
      ]
    default:
      return [{ value: 'skip', label: '跳过' }]
  }
}

function initialActions(entries: SyncEntry[]): Record<string, SyncAction> {
  const out: Record<string, SyncAction> = {}
  for (const e of entries) {
    // Writing App -> Markdown is a mirror operation and safe to preselect.
    // Importing Markdown -> App changes the manuscript, so it stays opt-in.
    if (e.state === 'app-new' || e.state === 'app-changed') {
      out[e.key] = 'export'
    } else if (e.state === 'md-moved' || e.state === 'converged') {
      out[e.key] = 'acknowledge'
    } else {
      out[e.key] = 'skip'
    }
  }
  return out
}

function Summary({ label, summary }: { label?: string; summary: SyncSummary | null }) {
  if (!summary) return null
  const title = summary.title || summary.name || ''
  const bits: string[] = []
  if (summary.title && summary.order) bits.push(`第 ${summary.order} 章`)
  if (summary.volume) bits.push(summary.volume)
  if (typeof summary.beatCount === 'number') bits.push(`${summary.beatCount} 条梗概`)
  if (summary.type) bits.push(TYPE_LABELS[summary.type] || summary.type)
  if (summary.aliases?.length) bits.push(`别名：${summary.aliases.join('、')}`)
  return (
    <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
      <div className="truncate">
        {label && <span className="font-medium text-gray-600 dark:text-gray-300">{label}：</span>}
        <span>{title || '（未命名）'}</span>
        {bits.length > 0 && <span className="text-gray-400"> · {bits.join(' · ')}</span>}
      </div>
      {summary.beats?.length ? (
        <div className="truncate text-gray-400 dark:text-gray-500">{summary.beats.filter(Boolean).join(' / ')}</div>
      ) : null}
      {summary.description ? (
        <div className="truncate text-gray-400 dark:text-gray-500">{summary.description}</div>
      ) : null}
    </div>
  )
}

export function SyncPage() {
  const { alert, confirm } = useDialog()
  const [settings, setSettings] = useState<SyncSettings | null>(null)
  const [plan, setPlan] = useState<SyncScanResult | null>(null)
  const [actions, setActions] = useState<Record<string, SyncAction>>({})
  const [busy, setBusy] = useState(false)
  const [showUnchanged, setShowUnchanged] = useState(false)

  async function scan() {
    setBusy(true)
    try {
      const p = await api.scanSync()
      setPlan(p)
      setActions(initialActions(p.entries))
    } catch (e) {
      await alert(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const s = await api.getSyncSettings()
        if (cancelled) return
        setSettings(s)
        if (s.valid) {
          const p = await api.scanSync()
          if (cancelled) return
          setPlan(p)
          setActions(initialActions(p.entries))
        }
      } catch (e) {
        if (!cancelled) await alert(errorMessage(e))
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function chooseFolder() {
    try {
      const { path } = await api.pickDirectory()
      if (!path) return
      if (
        settings?.mdRoot &&
        !(await confirm('更换同步文件夹会清空同步状态（不会删除任何文件）。继续？'))
      ) {
        return
      }
      setBusy(true)
      const s = await api.saveSyncSettings(path)
      setSettings(s)
      setPlan(null)
      setActions({})
      setBusy(false)
      await scan()
    } catch (e) {
      setBusy(false)
      await alert(errorMessage(e))
    }
  }

  async function resetState() {
    if (!(await confirm('重置同步状态？下次扫描会把两边都当首次同步，不会删除文件。'))) return
    setBusy(true)
    try {
      await api.resetSync()
      await scan()
    } catch (e) {
      await alert(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const entriesByState = useMemo(() => {
    const map = new Map<SyncEntryState, SyncEntry[]>()
    for (const e of plan?.entries ?? []) {
      if (!map.has(e.state)) map.set(e.state, [])
      map.get(e.state)!.push(e)
    }
    return map
  }, [plan])

  const pending = useMemo(() => {
    if (!plan) return 0
    return plan.entries.filter((e) => (actions[e.key] ?? 'skip') !== 'skip').length
  }, [plan, actions])

  const unresolvedConflicts = useMemo(() => {
    if (!plan) return 0
    return plan.entries.filter((e) => e.state === 'conflict' && (actions[e.key] ?? 'skip') === 'skip').length
  }, [plan, actions])

  async function apply() {
    if (!plan) return
    if (recentlyEdited(1000)) {
      await alert('刚编辑过正文，请等自动保存完成后再同步。')
      return
    }
    const decisions: SyncDecision[] = plan.entries
      .filter((e) => (actions[e.key] ?? 'skip') !== 'skip')
      .map((e) => ({
        key: e.key,
        action: actions[e.key],
        expectedAppHash: e.appHash,
        expectedMdHash: e.mdHash,
      }))
    if (!decisions.length) {
      await alert('没有勾选任何操作。')
      return
    }
    const destructive = decisions.some((d) => d.action === 'delete-app' || d.action === 'delete-md')
    if (destructive && !(await confirm('包含删除操作。删除前会备份到 .sync-backups，继续？'))) return

    setBusy(true)
    try {
      const res = await api.applySync(decisions)
      const store = useStore.getState()
      const p = res.project
      store.patchNodes(p.nodes)
      store.patchConcepts(p.concepts.concepts, p.concepts.relations)
      store.patchVolumes(p.volumes)
      store.patchStorylines(p.storylines.storylines)
      store.patchConnections(p.connections)
      store.patchWhiteboard(p.whiteboard.items)
      store.patchRelationsBoard(p.relationsBoard.items)
      const cur = store.currentNodeId
      if (cur && !p.nodes.some((n) => n.id === cur)) {
        store.setCurrentNodeId(null)
      } else if (cur) {
        try {
          const n = await api.getNode(cur)
          store.setCurrentNode({
            id: n.id,
            title: n.meta.title ?? '',
            beats: n.meta.beats ?? [],
            questions: n.meta.questions ?? [],
          })
        } catch {
          /* node may have been removed */
        }
      }
      const lines: string[] = []
      lines.push(`已处理 ${res.applied} 项`)
      if (res.stale.length) lines.push(`${res.stale.length} 项在扫描后被修改，已跳过，请重新扫描`)
      if (res.errors.length) lines.push(`失败 ${res.errors.length} 项：${res.errors.map((x) => x.message).join('；')}`)
      if (res.warnings.length) lines.push(res.warnings.slice(0, 3).join('；'))
      await alert(lines.join('\n'))
      try {
        setSettings(await api.getSyncSettings())
      } catch {
        /* ignore */
      }
      await scan()
    } catch (e) {
      await alert(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Obsidian 同步</h2>
        <p className="text-[11px] text-gray-400 mt-0.5">
          只管理 章节目录/、人物.md、概念.md；章节按 order 自动编号（0001 标题.md）。删除前会备份到 .sync-backups。
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
          <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">同步文件夹</div>
            <div className="flex items-center gap-2">
              <button
                onClick={chooseFolder}
                disabled={busy}
                className="px-2.5 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                {settings?.mdRoot ? '更换文件夹' : '选择文件夹'}
              </button>
              {plan && (
                <button
                  onClick={scan}
                  disabled={busy}
                  className="px-2.5 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  重新扫描
                </button>
              )}
            </div>
          </div>
          <div className="px-3 py-2 text-xs text-gray-600 dark:text-gray-300">
            {settings?.mdRoot ? (
              <div className="space-y-1">
                <div className="font-mono text-[11px] break-all">{settings.mdRoot}</div>
                <div className="text-[11px] text-gray-400">
                  {settings.lastSyncAt
                    ? `上次同步：${new Date(settings.lastSyncAt).toLocaleString()}`
                    : '尚未同步过'}
                  {settings.entryCount > 0 ? ` · 已记录 ${settings.entryCount} 项` : ''}
                </div>
              </div>
            ) : (
              <div className="text-gray-500 dark:text-gray-400">
                选一个本机文件夹（建议放在 Obsidian 库里的独立目录）。同步会在里面生成
                <span className="font-mono"> 章节目录/</span>、<span className="font-mono">人物.md</span>、
                <span className="font-mono">概念.md</span>。
              </div>
            )}
          </div>
          {settings?.mdRoot && (
            <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-700">
              <button
                onClick={resetState}
                disabled={busy}
                className="text-[11px] text-gray-400 hover:text-red-500 disabled:opacity-50"
              >
                重置同步状态
              </button>
            </div>
          )}
        </div>

        {plan && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {GROUPS.filter((g) => (plan.counts[g.state] || 0) > 0 && (g.state !== 'unchanged' || showUnchanged)).map((g) => (
                <span key={g.state} className={`px-2 py-0.5 rounded-full text-[11px] ${g.tone}`}>
                  {g.label} {plan.counts[g.state]}
                </span>
              ))}
              <button
                onClick={() => setShowUnchanged((v) => !v)}
                className="px-2 py-0.5 rounded-full text-[11px] text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                {showUnchanged ? '隐藏无变化' : `显示无变化 (${plan.counts.unchanged || 0})`}
              </button>
            </div>

            {plan.warnings.length > 0 && (
              <div className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
                {plan.warnings.join('；')}
              </div>
            )}

            {GROUPS.map((group) => {
              const list = entriesByState.get(group.state) || []
              if (!list.length) return null
              if (group.state === 'unchanged' && !showUnchanged) return null
              return (
                <div key={group.state} className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 overflow-hidden">
                  <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{group.label}</span>
                      <span className="ml-2 text-[11px] text-gray-400">{group.hint}</span>
                    </div>
                    <div className="flex gap-1.5">
                      {['app-new', 'app-changed'].includes(group.state) && (
                        <button
                          onClick={() =>
                            setActions((a) => {
                              const next = { ...a }
                              for (const e of list) next[e.key] = 'export'
                              return next
                            })
                          }
                          className="text-[11px] text-blue-600 hover:underline"
                        >
                          全部导出
                        </button>
                      )}
                      {['md-new', 'md-changed'].includes(group.state) && (
                        <button
                          onClick={() =>
                            setActions((a) => {
                              const next = { ...a }
                              for (const e of list) next[e.key] = 'import'
                              return next
                            })
                          }
                          className="text-[11px] text-emerald-600 hover:underline"
                        >
                          全部导入
                        </button>
                      )}
                      <button
                        onClick={() =>
                          setActions((a) => {
                            const next = { ...a }
                            for (const e of list) next[e.key] = 'skip'
                            return next
                          })
                        }
                        className="text-[11px] text-gray-400 hover:underline"
                      >
                        全部跳过
                      </button>
                    </div>
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {list.map((e) => (
                      <div key={e.key} className="px-3 py-2">
                        <div className="flex items-start gap-2">
                          <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] ${STATE_BY_KEY.get(e.state)?.tone || ''}`}>
                            {e.kind === 'chapter' ? '章节' : '设定'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-gray-700 dark:text-gray-200 truncate">
                              {e.name || '（未命名）'}
                            </div>
                            {e.path && <div className="text-[11px] text-gray-400 font-mono truncate">{e.path}</div>}
                            {e.state === 'conflict' ? (
                              <div className="grid grid-cols-2 gap-2 mt-1">
                                <Summary label="App" summary={e.appSummary} />
                                <Summary label="Markdown" summary={e.mdSummary} />
                              </div>
                            ) : (
                              <Summary summary={e.appSummary || e.mdSummary} />
                            )}
                            {e.warnings.length > 0 && (
                              <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                                {e.warnings.join('；')}
                              </div>
                            )}
                          </div>
                          <select
                            value={actions[e.key] ?? 'skip'}
                            onChange={(ev) => setActions((a) => ({ ...a, [e.key]: ev.target.value as SyncAction }))}
                            className="shrink-0 max-w-[190px] text-[11px] border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded px-1.5 py-1"
                          >
                            {optionsFor(e).map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}

            {plan.entries.length === 0 && (
              <div className="text-center text-sm text-gray-400 py-10">两边都没有可同步的章节或设定。</div>
            )}
          </>
        )}
      </div>

      {plan && (
        <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between gap-2">
          <div className="text-[11px] text-gray-400">
            {pending} 项已选择
            {unresolvedConflicts > 0 && (
              <span className="text-red-500 ml-1">· {unresolvedConflicts} 个冲突尚未选择</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActions(initialActions(plan.entries))}
              disabled={busy}
              className="px-2.5 py-1.5 text-xs rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              重置选择
            </button>
            <button
              onClick={apply}
              disabled={busy || pending === 0}
              className="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? '处理中…' : '同步所选'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
