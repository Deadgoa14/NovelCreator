import { create } from 'zustand'
import { useSettings } from './settings'

export interface TtsState {
  status: 'idle' | 'speaking' | 'paused'
  charIndex: number
  totalChars: number
  setStatus: (s: TtsState['status']) => void
  setProgress: (charIndex: number, totalChars: number) => void
  reset: () => void
}

export const useTts = create<TtsState>((set) => ({
  status: 'idle',
  charIndex: 0,
  totalChars: 0,
  setStatus: (status) => set({ status }),
  setProgress: (charIndex, totalChars) => set({ charIndex, totalChars }),
  reset: () => set({ status: 'idle', charIndex: 0, totalChars: 0 }),
}))

// ---- Speech synthesis helpers (browser Web Speech API, chunked) ----

let keepAliveTimer: ReturnType<typeof setInterval> | null = null
let stopped = false

function splitChunks(text: string, maxLen: number): string[] {
  const parts = text.split(/(?<=[。！？!?；;\n])/)
  const chunks: string[] = []
  let cur = ''
  for (const p of parts) {
    if (cur.length + p.length > maxLen && cur) {
      chunks.push(cur)
      cur = p
    } else {
      cur += p
    }
  }
  if (cur.trim()) chunks.push(cur)
  return chunks
}

export function speakText(text: string) {
  if (!text.trim()) return
  const { ttsRate, ttsVoice } = useSettings.getState()
  stopSpeech()
  stopped = false
  const chunks = splitChunks(text, 200)
  const voice = ttsVoice ? window.speechSynthesis.getVoices().find((v) => v.voiceURI === ttsVoice) : undefined
  let i = 0
  const baseOf = (idx: number) => chunks.slice(0, idx).join('').length

  useTts.getState().setStatus('speaking')
  useTts.getState().setProgress(0, text.length)

  function speakNext() {
    if (stopped) return
    if (i >= chunks.length) {
      stopSpeech()
      return
    }
    const utter = new SpeechSynthesisUtterance(chunks[i])
    utter.lang = 'zh-CN'
    utter.rate = ttsRate
    if (voice) utter.voice = voice
    const base = baseOf(i)
    utter.onboundary = (e) => {
      const idx = (typeof e.charIndex === 'number' ? e.charIndex : 0) + base
      useTts.getState().setProgress(idx, text.length)
    }
    utter.onend = () => {
      i += 1
      speakNext()
    }
    utter.onerror = () => {
      i += 1
      speakNext()
    }
    window.speechSynthesis.speak(utter)
  }

  speakNext()

  // Chrome pauses long utterances after ~15s; resume periodically to keep going.
  keepAliveTimer = setInterval(() => {
    if (useTts.getState().status === 'speaking') window.speechSynthesis.resume()
  }, 10000)
}

export function pauseSpeech() {
  window.speechSynthesis.pause()
  useTts.getState().setStatus('paused')
}

export function resumeSpeech() {
  window.speechSynthesis.resume()
  useTts.getState().setStatus('speaking')
}

export function stopSpeech() {
  stopped = true
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer)
    keepAliveTimer = null
  }
  window.speechSynthesis.cancel()
  useTts.getState().reset()
}
