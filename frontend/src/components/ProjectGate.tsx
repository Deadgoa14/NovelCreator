import { useState } from 'react'
import { api, errorMessage } from '../api'
import { useStore } from '../store'

export function ProjectGate() {
  const setProject = useStore((s) => s.setProject)
  const [name, setName] = useState('我的小说')
  const [path, setPath] = useState('')
  const [mode, setMode] = useState<'create' | 'open'>('create')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setBusy(true)
    setError('')
    try {
      const p = path.trim()
      const data = mode === 'create' ? await api.createProject(p, name.trim()) : await api.openProject(p)
      setProject(data, p)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const tabCls = (active: boolean) =>
    `px-4 py-2 rounded-md text-sm font-medium transition-colors ${
      active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
    }`

  return (
    <div className="h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
      <div className="w-[460px] bg-white rounded-2xl shadow-xl p-8">
        <h1 className="text-xl font-bold mb-1">小说写作助手</h1>
        <p className="text-sm text-gray-500 mb-6">项目数据以文件夹形式保存在本地</p>

        <div className="flex gap-2 mb-5">
          <button className={tabCls(mode === 'create')} onClick={() => setMode('create')}>
            新建项目
          </button>
          <button className={tabCls(mode === 'open')} onClick={() => setMode('open')}>
            打开项目
          </button>
        </div>

        {mode === 'create' && (
          <label className="block mb-4">
            <span className="text-sm text-gray-600">项目名称</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
        )}

        <label className="block mb-5">
          <span className="text-sm text-gray-600">
            {mode === 'create' ? '保存路径（空文件夹或不存在的新路径）' : '项目路径（含 project.json 的文件夹）'}
          </span>
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="例如：H:/Novels/我的小说"
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        {error && <div className="text-red-600 text-sm mb-4 whitespace-pre-wrap">{error}</div>}

        <button
          onClick={submit}
          disabled={busy || !path.trim()}
          className="w-full bg-blue-600 text-white rounded-md py-2.5 text-sm font-medium disabled:opacity-50 hover:bg-blue-700 transition-colors"
        >
          {busy ? '处理中…' : mode === 'create' ? '创建项目' : '打开项目'}
        </button>
      </div>
    </div>
  )
}
