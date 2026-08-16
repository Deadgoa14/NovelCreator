import { useEffect, useRef } from 'react'
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
import { compileConcepts } from '../highlight'

// Concept list lives in a facet so the highlight field can read it from state and
// recompute decorations whenever it changes.
const conceptsFacet = Facet.define<Concept[], Concept[]>({
  combine: (values) => values[values.length - 1] ?? [],
})

function buildDecorations(doc: Text, concepts: Concept[]): DecorationSet {
  const { entries, regex } = compileConcepts(concepts)
  if (!regex) return Decoration.none
  const text = doc.toString()
  const ranges: Range<Decoration>[] = []
  regex.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = regex.exec(text))) {
    const matched = m[0]
    const color = entries.find((e) => e.text === matched)?.concept.color
    if (color) {
      ranges.push(
        Decoration.mark({
          attributes: {
            style: `color:${color};background-color:${color}22;border-radius:3px`,
          },
        }).range(m.index, m.index + matched.length),
      )
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
        return buildDecorations(state.doc, state.facet(conceptsFacet))
      },
      update(decorations, tr) {
        if (tr.docChanged || tr.reconfigured) {
          return buildDecorations(tr.state.doc, tr.state.facet(conceptsFacet))
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

  // Typography change → refresh the theme.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartmentRef.current!.reconfigure(makeTheme(fontFamily, fontSize, textColor)),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontFamily, fontSize, textColor])

  return <div ref={hostRef} className={className ?? 'w-full'} />
}
