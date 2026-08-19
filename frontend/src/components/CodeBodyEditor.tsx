import { useEffect, useRef, useState } from 'react'
import {
  Compartment,
  EditorState,
  Facet,
  RangeSet,
  StateField,
} from '@codemirror/state'
import type { Extension, Range, Text } from '@codemirror/state'
import { Decoration, EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import type { Concept } from '../types'
import { compileConcepts, modeFor, styleCss } from '../highlight'
import { useSettings, type HighlightStyle } from '../settings'

// Concept list lives in a facet so the highlight field can read it from state and
// recompute decorations whenever it changes. Same for the highlight style.
const conceptsFacet = Facet.define<Concept[], Concept[]>({
  combine: (values) => values[values.length - 1] ?? [],
})
const styleFacet = Facet.define<{ character: HighlightStyle; concept: HighlightStyle }, { character: HighlightStyle; concept: HighlightStyle }>({
  combine: (values) => values[values.length - 1] ?? { character: 'both', concept: 'both' },
})

function buildDecorations(doc: Text, concepts: Concept[], style: { character: HighlightStyle; concept: HighlightStyle }): DecorationSet {
  const { entries, regex } = compileConcepts(concepts)
  if (!regex) return Decoration.none
  const text = doc.toString()
  const ranges: Range<Decoration>[] = []
  regex.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = regex.exec(text))) {
    const matched = m[0]
    const concept = entries.find((e) => e.text === matched)?.concept
    const css = concept ? styleCss(modeFor(concept, style.character, style.concept), concept.color) : {}
    const styleStr = Object.entries(css)
      .map(([k, v]) => `${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}:${v}`)
      .join(';')
    if (styleStr) {
      ranges.push(Decoration.mark({ attributes: { style: styleStr } }).range(m.index, m.index + matched.length))
    }
    if (matched.length === 0) regex.lastIndex++
  }
  return ranges.length ? RangeSet.of(ranges) : Decoration.none
}

interface Props {
  value: string
  onChange: (v: string) => void
  concepts: Concept[]
  fontFamily: string
  fontSize: number | string
  textColor: string
  placeholder?: string
  className?: string
  onReady?: (view: EditorView) => void
  onRegister?: (type: 'character' | 'generic', text: string) => void
}

/** CodeMirror-backed 正文/梗概 editor: stable editing (IME/caret/undo) plus live
 * concept highlighting via decorations. */
export function CodeBodyEditor({
  value,
  onChange,
  concepts,
  fontFamily,
  fontSize,
  textColor,
  placeholder,
  className,
  onReady,
  onRegister,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  const themeCompartmentRef = useRef<Compartment | null>(null)
  if (themeCompartmentRef.current === null) themeCompartmentRef.current = new Compartment()
  const conceptsCompartmentRef = useRef<Compartment | null>(null)
  if (conceptsCompartmentRef.current === null) conceptsCompartmentRef.current = new Compartment()
  const styleCompartmentRef = useRef<Compartment | null>(null)
  if (styleCompartmentRef.current === null) styleCompartmentRef.current = new Compartment()
  const characterStyle = useSettings((s) => s.characterHighlightStyle)
  const conceptStyle = useSettings((s) => s.conceptHighlightStyle)

  function makeTheme(fontFamily: string, fontSize: number | string, textColor: string): Extension {
    const size = typeof fontSize === 'number' ? `${fontSize}px` : fontSize
    return EditorView.theme({
      '&': { fontSize: size, color: textColor, outline: 'none' },
      '&.cm-focused': { outline: 'none' },
      '.cm-content': { fontFamily, lineHeight: '1.9', caretColor: '#3b82f6' },
      '.cm-line': { lineHeight: '1.9' },
    })
  }

  // Create the editor once.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const highlightField = StateField.define<DecorationSet>({
      create(state) {
        return buildDecorations(state.doc, state.facet(conceptsFacet), state.facet(styleFacet))
      },
      update(decorations, tr) {
        if (tr.docChanged || tr.reconfigured) {
          return buildDecorations(tr.state.doc, tr.state.facet(conceptsFacet), tr.state.facet(styleFacet))
        }
        return decorations.map(tr.changes)
      },
      provide: (f) => EditorView.decorations.from(f),
    })

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          highlightField,
          themeCompartmentRef.current!.of(makeTheme(fontFamily, fontSize, textColor)),
          conceptsCompartmentRef.current!.of(conceptsFacet.of(concepts)),
          styleCompartmentRef.current!.of(styleFacet.of({ character: characterStyle, concept: conceptStyle })),
          cmPlaceholder(placeholder ?? ''),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString())
          }),
        ],
      }),
    })
    viewRef.current = view
    onReadyRef.current?.(view)
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Create once with initial props; later changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // External value change (switch node / AI write-back) → replace the document.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
    }
  }, [value])

  // Concept list change → refresh the highlight facet.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: conceptsCompartmentRef.current!.reconfigure(conceptsFacet.of(concepts)),
    })
  }, [concepts])

  // Highlight style change → refresh the style facet.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: styleCompartmentRef.current!.reconfigure(styleFacet.of({ character: characterStyle, concept: conceptStyle })),
    })
  }, [characterStyle, conceptStyle])

  // Typography change → refresh the theme.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartmentRef.current!.reconfigure(makeTheme(fontFamily, fontSize, textColor)),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontFamily, fontSize, textColor])

  const [menu, setMenu] = useState<{ x: number; y: number; text: string } | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Element)) setMenu(null)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [menu])

  function onContextMenu(e: React.MouseEvent) {
    const view = viewRef.current
    if (!view) return
    const sel = view.state.selection.main
    const text = view.state.sliceDoc(sel.from, sel.to)
    if (!text.trim()) return
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, text })
  }

  async function copySel() {
    if (menu) await navigator.clipboard.writeText(menu.text).catch(() => {})
    setMenu(null)
  }
  async function cutSel() {
    if (!menu) return
    const view = viewRef.current
    await navigator.clipboard.writeText(menu.text).catch(() => {})
    view?.dispatch(view.state.replaceSelection(''))
    setMenu(null)
  }
  async function pasteAt() {
    const view = viewRef.current
    if (!view) return
    try {
      const t = await navigator.clipboard.readText()
      view.dispatch(view.state.replaceSelection(t))
    } catch {
      /* ignore */
    }
    setMenu(null)
  }
  function register(type: 'character' | 'generic') {
    if (menu) onRegister?.(type, menu.text)
    setMenu(null)
  }

  return (
    <>
      <div ref={hostRef} className={className ?? 'w-full'} onContextMenu={onContextMenu} />
      {menu && (
        <div
          ref={menuRef}
          className="fixed z-[300] bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 py-1 text-sm"
          style={{ left: menu.x, top: menu.y }}
        >
          <button onClick={copySel} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200">复制</button>
          <button onClick={cutSel} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200">剪切</button>
          <button onClick={pasteAt} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200">粘贴</button>
          <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
          <button onClick={() => register('generic')} className="block w-full text-left px-4 py-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-300">注册为概念</button>
          <button onClick={() => register('character')} className="block w-full text-left px-4 py-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-300">注册为人物</button>
        </div>
      )}
    </>
  )
}
