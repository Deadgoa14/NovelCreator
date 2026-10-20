import { api } from '../api'
import { useStore } from '../store'
import { useDialog } from '../components/Dialog'
import { uid } from '../util'
import { parseNovelTxt, useTxtImport, type TxtPattern } from '../txtImportStore'

const PATTERN_LABELS: { value: TxtPattern; label: string }[] = [
  { value: 'auto', label: '自动检测' },
  { value: '第X章', label: '第一章 / 第十章' },
  { value: '第1章', label: '第 1 章' },
  { value: '数字', label: '1. / 1、' },
  { value: '特殊', label: '序章 / 楔子 / 尾声…' },
]

export function TxtImportPage() {
  const txt = useTxtImport()
  const { alert } = useDialog()

  function parse() {
    if (!txt.text.trim()) return
    const chapters = parseNovelTxt(txt.text, txt.settings)
    txt.setChapters(chapters)
    txt.setSel(new Set(chapters.map((_, i) => i)))
  }

  function toggle(i: number, on: boolean) {
    const next = new Set(txt.sel)
    if (on) next.add(i)
    else next.delete(i)
    txt.setSel(next)
  }

  async function doImport() {
    const chapters = txt.chapters
    if (!chapters) return
    const selected = chapters.filter((_, i) => txt.sel.has(i))
    if (!selected.length) {
      await alert('请先勾选要导入的章节')
      return
    }
    const s = useStore.getState()
    const createdIds: string[] = []
    for (const ch of selected) {
      const node = await api.createNode()
      await api.updateNode(node.id, { title: ch.title, beats: [{ id: uid('beat'), text: ch.title, body: ch.content }] })
      createdIds.push(node.id)
    }
    if (txt.settings.importOrder) {
      const all = await api.listNodes()
      const otherIds = all.map((n) => n.id).filter((id) => !createdIds.includes(id))
      await api.reorderNodes([...createdIds, ...otherIds])
    }
    s.patchNodes(await api.listNodes())
    if (createdIds.length) s.setCurrentNodeId(createdIds[0])
    await alert(`已导入 ${createdIds.length} 个章节`)
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => txt.setText(String(reader.result ?? ''))
    reader.readAsText(file)
  }

  const total = txt.chapters?.length ?? 0

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">导入小说（TXT）</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <label className="block">
          <span className="text-xs text-gray-500 dark:text-gray-400">选择 .txt 文件（或直接粘贴全文）</span>
          <input type="file" accept=".txt,text/plain" onChange={onFile} className="block mt-1 text-xs text-gray-600 dark:text-gray-300" />
        </label>

        <textarea
          value={txt.text}
          onChange={(e) => txt.setText(e.target.value)}
          placeholder="把小说全文粘贴到这里…"
          className="w-full h-40 text-sm border border-gray-300 rounded-md px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
        />

        <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-3 space-y-3">
          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">导入设置</div>
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
            标题序号格式
            <select
              value={txt.settings.pattern}
              onChange={(e) => txt.setSettings({ ...txt.settings, pattern: e.target.value as TxtPattern })}
              className="text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded px-2 py-1"
            >
              {PATTERN_LABELS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              checked={txt.settings.keepNumber}
              onChange={(e) => txt.setSettings({ ...txt.settings, keepNumber: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300"
            />
            保留章节序号文本（如「第一章」）
          </label>
          <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              checked={txt.settings.importOrder}
              onChange={(e) => txt.setSettings({ ...txt.settings, importOrder: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300"
            />
            按原文序号排列（适合空白项目；不勾选则追加到现有章节之后）
          </label>
        </div>

        <div className="flex gap-2">
          <button onClick={parse} disabled={!txt.text.trim()} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">解析</button>
          <button onClick={() => txt.clear()} className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600">清空</button>
        </div>

        {txt.chapters && (
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">识别到 {total} 章</div>
              <div className="flex gap-3">
                <button onClick={() => txt.setSel(new Set())} className="text-xs text-gray-400 hover:text-gray-600">全不选</button>
                <button onClick={() => txt.setSel(new Set(txt.chapters!.map((_, i) => i)))} className="text-xs text-blue-600 hover:text-blue-700">全选</button>
                <button onClick={doImport} className="text-xs text-blue-600 hover:text-blue-700">导入所选</button>
              </div>
            </div>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {txt.chapters.map((ch, i) => (
                <label key={i} className="flex items-start gap-2 py-1 cursor-pointer">
                  <input type="checkbox" checked={txt.sel.has(i)} onChange={(e) => toggle(i, e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300" />
                  <span className="text-sm">
                    <span className="text-gray-800 dark:text-gray-200">{ch.title || '（未命名）'}</span>
                    <span className="block text-xs text-gray-400">{ch.content.length} 字</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {!txt.chapters && (
          <div className="text-center text-gray-400 text-sm py-4">粘贴/选择 txt 后点「解析」，按章节标题自动切分。</div>
        )}
      </div>
    </div>
  )
}
