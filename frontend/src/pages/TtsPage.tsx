import { useEffect, useState } from 'react'
import { useSettings } from '../settings'
import { speakText, stopSpeech } from '../ttsStore'

export function TtsPage() {
  const s = useSettings()
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  useEffect(() => {
    const load = () => setVoices(window.speechSynthesis.getVoices())
    load()
    window.speechSynthesis.onvoiceschanged = load
    return () => {
      window.speechSynthesis.onvoiceschanged = null
    }
  }, [])

  const zhVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('zh'))
  const shown = zhVoices.length > 0 ? zhVoices : voices

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">朗读</h2>
        <p className="text-[11px] text-gray-400 mt-0.5">使用浏览器内置 TTS，语音取决于系统安装的语音包。</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <div>
          <div className="text-sm text-gray-600 dark:text-gray-300 mb-1.5">语音包</div>
          <select
            value={s.ttsVoice}
            onChange={(e) => s.set({ ttsVoice: e.target.value })}
            className="w-full text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-md px-3 py-2"
          >
            <option value="">系统默认</option>
            {shown.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name}（{v.lang}）
              </option>
            ))}
          </select>
          {voices.length > 0 && zhVoices.length === 0 && (
            <div className="text-[11px] text-gray-400 mt-1">未检测到中文语音，已列出全部语音。</div>
          )}
        </div>

        <div>
          <div className="text-sm text-gray-600 dark:text-gray-300 mb-1.5">
            阅读速度：<span className="font-medium">{s.ttsRate.toFixed(1)}x</span>
          </div>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={s.ttsRate}
            onChange={(e) => s.set({ ttsRate: Number(e.target.value) })}
            className="w-full"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => speakText('这是一个测试，用来试听语音包和阅读速度的效果。')}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            🔊 试听
          </button>
          <button onClick={stopSpeech} className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600">
            ⏹ 停止
          </button>
        </div>
      </div>
    </div>
  )
}
