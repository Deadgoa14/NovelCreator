import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Settings {
  theme: 'light' | 'dark'
  whiteboardBeatFontSize: number
  previewTextBg: string
  previewMarginBg: string
  previewFontFamily: string
  previewFontSize: number
  set: (patch: Partial<Omit<Settings, 'set'>>) => void
}

export const FONT_FAMILIES = [
  {
    label: '默认',
    value: `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif`,
  },
  { label: '宋体', value: `'SimSun', 'Songti SC', serif` },
  { label: '黑体', value: `'SimHei', 'Heiti SC', 'Microsoft YaHei', sans-serif` },
  { label: '楷体', value: `'KaiTi', 'Kaiti SC', serif` },
]

export const FONT_SIZES = [14, 16, 18, 20, 24, 28]

const DEFAULT_FONT_FAMILY = FONT_FAMILIES[0].value

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      theme: 'light',
      whiteboardBeatFontSize: 11,
      previewTextBg: '#ffffff',
      previewMarginBg: '#f9fafb',
      previewFontFamily: DEFAULT_FONT_FAMILY,
      previewFontSize: 18,
      set: (patch) => set(patch),
    }),
    { name: 'ddgame-settings' },
  ),
)
