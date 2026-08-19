import { api } from '../api'
import { useStore } from '../store'
import { useDialog } from '../components/Dialog'
import { uid } from '../util'
import { parseNovelMd, useMdImport, type ParsedDoc, type ParsedNode } from '../mdImportStore'

function NodeCheck({ checked, onToggle, node }: { checked: boolean; onToggle: (v: boolean) => void; node: ParsedNode }) {
  return (
    <label className="flex items-start gap-2 py-1 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onToggle(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-gray-300"
      />
      <span className="text-sm">
        <span className="text-gray-800 dark:text-gray-200">{node.title || '（无标题）'}</span>
        <span className="block text-xs text-gray-400">
          {node.notes.length > 0 && <span className="text-amber-600">要点 {node.notes.length}</span>}
          {node.notes.length > 0 && node.questions.length > 0 && ' · '}
          {node.questions.length > 0 && <span className="text-violet-600">问题 {node.questions.length}</span>}
          {(node.notes.length === 0 && node.questions.length === 0) && '—'}
        </span>
      </span>
    </label>
  )
}

export function MdImportPage() {
  const md = useMdImport()
  const { alert } = useDialog()

  function parse() {
    if (!md.text.trim()) return
    const doc = parseNovelMd(md.text, md.rules)
    md.setDoc(doc)
    const all = new Set<string>()
    doc.loose.forEach((_, i) => all.add('l' + i))
    doc.volumes.forEach((v, vi) => v.nodes.forEach((_, ni) => all.add('v' + vi + 'n' + ni)))
    md.setSel(all)
  }

  function toggle(key: string, on: boolean) {
    const next = new Set(md.sel)
    if (on) next.add(key)
    else next.delete(key)
    md.setSel(next)
  }

  function toggleVolume(vi: number, on: boolean) {
    const vol = md.doc?.volumes[vi]
    if (!vol) return
    const next = new Set(md.sel)
    vol.nodes.forEach((_, ni) => {
      const k = 'v' + vi + 'n' + ni
      if (on) next.add(k)
      else next.delete(k)
    })
    md.setSel(next)
  }

  async function doImport() {
    const doc = md.doc
    if (!doc) return
    const s = useStore.getState()
    const volIdByIndex = new Map<number, string>()
    for (let vi = 0; vi < doc.volumes.length; vi++) {
      const vol = doc.volumes[vi]
      if (vol.nodes.some((_, ni) => md.sel.has('v' + vi + 'n' + ni))) {
        volIdByIndex.set(vi, (await api.createVolume(vol.name)).id)
      }
    }
    const order: { type: 'loose' | 'volume'; vi: number; ni: number }[] = []
    doc.loose.forEach((_, ni) => {
      if (md.sel.has('l' + ni)) order.push({ type: 'loose', vi: -1, ni })
    })
    doc.volumes.forEach((vol, vi) => {
      vol.nodes.forEach((_, ni) => {
        if (md.sel.has('v' + vi + 'n' + ni)) order.push({ type: 'volume', vi, ni })
      })
    })
    if (!order.length) {
      await alert('请先勾选要导入的卷 / 章节')
      return
    }
    const chaptersByVol = new Map<number, string[]>()
    let count = 0
    for (const it of order) {
      const node = it.type === 'loose' ? doc.loose[it.ni] : doc.volumes[it.vi].nodes[it.ni]
      const created = await api.createNode()
      const beat = { id: uid('beat'), text: node.text, body: node.body, notes: node.notes }
      await api.updateNode(created.id, {
        title: node.title,
        beats: [beat],
        questions: node.questions.map((q) => ({ id: uid('question'), text: q, answer: '' })),
      })
      if (it.type === 'volume') {
        if (!chaptersByVol.has(it.vi)) chaptersByVol.set(it.vi, [])
        chaptersByVol.get(it.vi)!.push(created.id)
      }
      count++
    }
    for (const [vi, ids] of chaptersByVol) {
      await api.setVolumeChapters(volIdByIndex.get(vi)!, ids)
    }
    s.patchNodes(await api.listNodes())
    s.patchVolumes(await api.listVolumes())
    await alert(`已导入 ${count} 个节点`)
  }

  const total = (md.doc?.loose.length ?? 0) + (md.doc?.volumes.reduce((a, v) => a + v.nodes.length, 0) ?? 0)

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">导入 Markdown</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <textarea
          value={md.text}
          onChange={(e) => md.setText(e.target.value)}
          placeholder={'按你的标题层级粘贴小说草稿：\n#### 卷\n##### 剧情节点（梗概）\n###### 写作要点 / 问题（以 ？ 结尾）\n\n普通段落会作为正文导入。'}
          className="w-full h-44 text-sm border border-gray-300 rounded-md px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
        />

        <div className="flex gap-2">
          <button
            onClick={parse}
            disabled={!md.text.trim()}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            解析
          </button>
          <button
            onClick={() => md.clear()}
            className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            清空
          </button>
        </div>

        <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-3 space-y-2">
          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">解析规则（改后点「解析」重新解析）</div>
          <div className="grid grid-cols-3 gap-2">
            {([
              ['volumeLevel', '卷', 'H4'],
              ['nodeLevel', '节点', 'H5'],
              ['noteLevel', '梗概/要点', 'H6'],
            ] as const).map(([key, label, placeholder]) => (
              <label key={key} className="text-xs text-gray-500 dark:text-gray-400">
                {label}级别
                <select
                  value={md.rules[key]}
                  onChange={(e) => md.setRules({ ...md.rules, [key]: Number(e.target.value) })}
                  className="mt-1 w-full text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded px-2 py-1"
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      H{n}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                checked={md.rules.italicAsNote}
                onChange={(e) => md.setRules({ ...md.rules, italicAsNote: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              斜体解析为非正文
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                checked={md.rules.ignoreStrike}
                onChange={(e) => md.setRules({ ...md.rules, ignoreStrike: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              忽略删除线文本（~~text~~）
            </label>
          </div>
        </div>

        {md.doc && (
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                预览（共 {total} 个节点）
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => md.setSel(new Set())} className="text-xs text-gray-400 hover:text-gray-600">
                  全不选
                </button>
                <button
                  onClick={() => {
                    const all = new Set<string>()
                    md.doc!.loose.forEach((_, i) => all.add('l' + i))
                    md.doc!.volumes.forEach((v, vi) => v.nodes.forEach((_, ni) => all.add('v' + vi + 'n' + ni)))
                    md.setSel(all)
                  }}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  全选
                </button>
                <button onClick={doImport} className="text-xs text-blue-600 hover:text-blue-700">
                  导入所选
                </button>
              </div>
            </div>

            {md.doc.loose.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs text-gray-400">（未归档到卷）</div>
                {md.doc.loose.map((n, ni) => (
                  <NodeCheck key={'l' + ni} checked={md.sel.has('l' + ni)} onToggle={(v) => toggle('l' + ni, v)} node={n} />
                ))}
              </div>
            )}

            {md.doc.volumes.map((vol, vi) => {
              const allOn = vol.nodes.every((_, ni) => md.sel.has('v' + vi + 'n' + ni))
              return (
                <div key={vi} className="border-t border-gray-100 dark:border-gray-700 pt-2">
                  <label className="flex items-center gap-2 py-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allOn}
                      onChange={(e) => toggleVolume(vi, e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">📚 {vol.name || '未命名卷'}</span>
                  </label>
                  <div className="pl-6 space-y-1">
                    {vol.nodes.map((n, ni) => (
                      <NodeCheck key={ni} checked={md.sel.has('v' + vi + 'n' + ni)} onToggle={(v) => toggle('v' + vi + 'n' + ni, v)} node={n} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {!md.doc && (
          <div className="text-center text-gray-400 text-sm py-6">
            粘贴 Markdown 后点「解析」，按标题层级拆出卷 / 章节 / 写作要点 / 问题。
          </div>
        )}
      </div>
    </div>
  )
}
