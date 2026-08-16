import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, errorMessage } from '../api'
import type { AiConfig, AiUsage } from '../api'
import { useDialog } from '../components/Dialog'

const inputCls =
  'w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100'

const AI_PROVIDERS = [
  { label: 'DeepSeek', baseURL: 'https://api.deepseek.com', model: 'deepseek-chat' },
  { label: 'DeepSeek（Anthropic 兼容）', baseURL: 'https://api.deepseek.com/anthropic', model: 'deepseek-chat' },
  { label: 'OpenAI（ChatGPT）', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o' },
  { label: 'Anthropic（Claude）', baseURL: 'https://api.anthropic.com', model: 'claude-opus-4-5' },
  { label: '通义千问', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { label: 'Kimi', baseURL: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { label: '智谱 GLM', baseURL: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { label: 'Ollama（本地）', baseURL: 'http://localhost:11434/v1', model: '' },
  { label: '自定义', baseURL: '', model: '' },
]

function fmtLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function inUsageRange(dateStr: string, range: 'today' | 'yesterday' | 'week' | 'month'): boolean {
  const today = new Date()
  if (range === 'today') return dateStr === fmtLocal(today)
  if (range === 'yesterday') return dateStr === fmtLocal(new Date(today.getTime() - 86400000))
  const days = range === 'week' ? 7 : 30
  const cutoff = new Date(today.getTime() - (days - 1) * 86400000)
  return dateStr >= fmtLocal(cutoff) && dateStr <= fmtLocal(today)
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="text-sm text-gray-600 dark:text-gray-300 shrink-0">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5">{title}</h3>
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 divide-y divide-gray-100 dark:divide-gray-700">
        {children}
      </div>
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex-1 min-w-[110px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
      <div className="text-[11px] text-gray-400 dark:text-gray-500">{label}</div>
      <div className={`text-lg font-semibold mt-1 ${accent ?? 'text-gray-800 dark:text-gray-100'}`}>{value}</div>
    </div>
  )
}

export function AiSettingsPage() {
  const { alert, confirm } = useDialog()
  const [ai, setAi] = useState<AiConfig>({ baseURL: '', apiKey: '', model: '' })
  const [showKey, setShowKey] = useState(false)
  const [savingAi, setSavingAi] = useState(false)
  const [usage, setUsage] = useState<AiUsage | null>(null)
  const [range, setRange] = useState<'today' | 'yesterday' | 'week' | 'month'>('week')
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar')

  useEffect(() => {
    api.getAiConfig().then(setAi).catch(() => {})
  }, [])

  // Poll usage while this page is mounted (local single-user app).
  useEffect(() => {
    let cancelled = false
    const load = () =>
      api
        .getAiUsage()
        .then((u) => {
          if (!cancelled) setUsage(u)
        })
        .catch(() => {})
    load()
    const id = setInterval(load, 3000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  async function saveAi() {
    setSavingAi(true)
    try {
      await api.saveAiConfig(ai)
      await alert('已保存')
    } catch (e) {
      await alert(errorMessage(e))
    } finally {
      setSavingAi(false)
    }
  }

  async function testAi() {
    try {
      await api.aiTest()
      await alert('连接成功')
    } catch (e) {
      await alert(errorMessage(e))
    }
  }

  async function resetUsage() {
    if (!(await confirm('确定要清零所有用量统计？'))) return
    try {
      setUsage(await api.resetAiUsage())
    } catch (e) {
      await alert(errorMessage(e))
    }
  }

  const activePreset = AI_PROVIDERS.findIndex((p) => p.baseURL === ai.baseURL)
  const chartData = (usage?.daily ?? [])
    .filter((d) => inUsageRange(d.date, range))
    .map((d) => ({
      date: d.date.slice(5),
      input: d.input,
      output: d.output,
    }))

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="p-3 border-b border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">AI API 配置</h2>
        <p className="text-[11px] text-gray-400 mt-0.5">API Key 保存在本机后端，不会上传、不会进 Git。</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <Section title="模型配置">
          <Row label="服务商">
            <select
              value={activePreset}
              onChange={(e) => {
                const p = AI_PROVIDERS[Number(e.target.value)]
                if (p) setAi({ ...ai, baseURL: p.baseURL, model: p.model })
              }}
              className={inputCls}
            >
              <option value={-1} disabled>
                自定义…
              </option>
              {AI_PROVIDERS.map((p, i) => (
                <option key={p.label} value={i}>
                  {p.label}
                </option>
              ))}
            </select>
          </Row>

          <Row label="Base URL">
            <input
              className={inputCls}
              value={ai.baseURL}
              onChange={(e) => setAi({ ...ai, baseURL: e.target.value })}
              placeholder="https://api.deepseek.com/v1"
            />
          </Row>

          <Row label="模型">
            <input
              className={inputCls}
              value={ai.model}
              onChange={(e) => setAi({ ...ai, model: e.target.value })}
              placeholder="deepseek-chat"
            />
          </Row>

          <Row label="API Key">
            <div className="flex items-center gap-2 flex-1">
              <input
                type={showKey ? 'text' : 'password'}
                className={inputCls}
                value={ai.apiKey}
                onChange={(e) => setAi({ ...ai, apiKey: e.target.value })}
                placeholder="sk-..."
              />
              <button
                onClick={() => setShowKey((v) => !v)}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0"
              >
                {showKey ? '隐藏' : '显示'}
              </button>
            </div>
          </Row>

          <div className="py-3 flex items-center gap-2">
            <button
              onClick={saveAi}
              disabled={savingAi}
              className="flex-1 bg-blue-600 text-white rounded-md py-2 text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {savingAi ? '保存中…' : '保存'}
            </button>
            <button
              onClick={testAi}
              className="px-4 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md py-2 text-sm hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              测试连接
            </button>
          </div>
        </Section>

        <Section title="用量统计">
          <div className="pt-3">
            <div className="flex flex-wrap gap-2">
              <StatCard label="请求次数" value={(usage?.totalRequests ?? 0).toLocaleString()} />
              <StatCard label="输入 tokens" value={(usage?.totalInput ?? 0).toLocaleString()} accent="text-blue-600" />
              <StatCard label="输出 tokens" value={(usage?.totalOutput ?? 0).toLocaleString()} accent="text-emerald-600" />
              <StatCard label="预计费用" value={`¥ ${(usage?.totalCost ?? 0).toFixed(2)}`} accent="text-amber-600" />
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div className="flex gap-1">
                {(
                  [
                    ['today', '今天'],
                    ['yesterday', '昨天'],
                    ['week', '近一周'],
                    ['month', '近一个月'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setRange(id)}
                    className={`px-2.5 py-1 text-xs rounded-md ${
                      range === id
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setChartType('bar')}
                  className={`px-2.5 py-1 text-xs rounded-md ${
                    chartType === 'bar'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  柱状
                </button>
                <button
                  onClick={() => setChartType('line')}
                  className={`px-2.5 py-1 text-xs rounded-md ${
                    chartType === 'line'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  折线
                </button>
              </div>
            </div>

            <div className="mt-2 h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                {chartType === 'bar' ? (
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      formatter={(value: number, name: string) => [value.toLocaleString(), name === 'input' ? '输入' : '输出']}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="input" name="输入" stackId="a" fill="#3b82f6" />
                    <Bar dataKey="output" name="输出" stackId="a" fill="#10b981" />
                  </BarChart>
                ) : (
                  <LineChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      formatter={(value: number, name: string) => [value.toLocaleString(), name === 'input' ? '输入' : '输出']}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="input" name="输入" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="output" name="输出" stroke="#10b981" strokeWidth={2} dot={false} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>

            {(usage?.byModel.length ?? 0) > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      <th className="py-1.5 pr-2 font-medium">模型</th>
                      <th className="py-1.5 pr-2 font-medium text-right">请求</th>
                      <th className="py-1.5 pr-2 font-medium text-right">输入</th>
                      <th className="py-1.5 pr-2 font-medium text-right">输出</th>
                      <th className="py-1.5 font-medium text-right">费用</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {usage?.byModel.map((m) => (
                      <tr key={m.model} className="text-gray-700 dark:text-gray-200">
                        <td className="py-1.5 pr-2 font-mono text-xs">{m.model}</td>
                        <td className="py-1.5 pr-2 text-right">{m.requests.toLocaleString()}</td>
                        <td className="py-1.5 pr-2 text-right">{m.input.toLocaleString()}</td>
                        <td className="py-1.5 pr-2 text-right">{m.output.toLocaleString()}</td>
                        <td className="py-1.5 text-right">¥ {m.cost.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="py-3 flex items-center justify-between">
              <span className="text-[11px] text-gray-400">费用为按模型公开价格估算，仅供参考。</span>
              <button
                onClick={resetUsage}
                className="px-4 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                重置统计
              </button>
            </div>
          </div>
        </Section>
      </div>
    </div>
  )
}
