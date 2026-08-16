import { create } from 'zustand'
import type { RawAnalysis } from './api'

// Persistent store for the raw-analysis page. The page is unmounted whenever the
// user switches tabs, so its input text / result must live outside the component
// (otherwise both are lost on navigation). The in-flight request itself is not
// cancelled — the backend keeps running and the result lands here even if the
// user has already switched away.
interface RawAnalysisState {
  text: string
  result: RawAnalysis | null
  loading: boolean
  error: string
  sel: Set<string>
  storylineId: string
  setText: (v: string) => void
  setResult: (v: RawAnalysis | null) => void
  setLoading: (v: boolean) => void
  setError: (v: string) => void
  setSel: (v: Set<string>) => void
  setStorylineId: (v: string) => void
  clear: () => void
}

export const useRawAnalysis = create<RawAnalysisState>((set) => ({
  text: '',
  result: null,
  loading: false,
  error: '',
  sel: new Set(),
  storylineId: '',
  setText: (text) => set({ text }),
  setResult: (result) => set({ result }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setSel: (sel) => set({ sel }),
  setStorylineId: (storylineId) => set({ storylineId }),
  clear: () => set({ text: '', result: null, error: '', sel: new Set() }),
}))
