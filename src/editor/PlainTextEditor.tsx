/**
 * PlainTextEditor — CodeMirror 6 based plain-text editor with Markdown
 * syntax highlighting. Used as an alternative to the rich MDXEditor.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import './PlainTextEditor.css';
import {
  lineNumbers, highlightActiveLineGutter, highlightSpecialChars,
  dropCursor, rectangularSelection, crosshairCursor,
  highlightActiveLine, EditorView, keymap,
} from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { history, defaultKeymap, historyKeymap, indentWithTab } from '@codemirror/commands';
import { foldGutter, HighlightStyle, syntaxHighlighting, indentOnInput, bracketMatching } from '@codemirror/language';
import {
  closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap,
} from '@codemirror/autocomplete';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { markdown } from '@codemirror/lang-markdown';
import { tags as t } from '@lezer/highlight';

export interface PlainTextEditorRef {
  focus(): void;
}

interface PlainTextEditorProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Syntax highlight style using Gera's design tokens.
 *
 * Colour assignments mirror the existing chip system so the visual language
 * stays consistent across the app:
 *   headings     → --text-primary (bold, scaled)
 *   links / URLs → --accent-blue
 *   inline code  → --chip-event-text  (blue)
 *   blockquotes  → --text-secondary italic
 *   list markers → --accent-blue
 *   YAML keys    → --chip-datetime-text (purple)
 *   YAML values  → --chip-project-text (green)
 *   YAML numbers → --chip-deadline-text (amber)
 *   punctuation  → --text-tertiary (subtle, keeps markup from competing with content)
 */
const geraHighlightStyle = HighlightStyle.define([
  // ── Headings ────────────────────────────────────────────────────────────
  { tag: t.heading1, color: 'var(--text-primary)', fontWeight: '700', fontSize: '1.35em' },
  { tag: t.heading2, color: 'var(--text-primary)', fontWeight: '700', fontSize: '1.2em' },
  { tag: t.heading3, color: 'var(--text-primary)', fontWeight: '600', fontSize: '1.1em' },
  { tag: [t.heading4, t.heading5, t.heading6], color: 'var(--text-secondary)', fontWeight: '600' },

  // ── Markup punctuation (**, __, ##, >, ---, `) ─────────────────────────
  // Keep syntax characters subtle so prose content stands out.
  { tag: t.processingInstruction, color: 'var(--text-tertiary)' },
  { tag: t.contentSeparator,      color: 'var(--text-tertiary)' },
  { tag: t.punctuation,           color: 'var(--text-tertiary)' },

  // ── Inline formatting ────────────────────────────────────────────────────
  { tag: t.strong,       fontWeight: '700' },
  { tag: t.emphasis,     fontStyle: 'italic' },
  { tag: t.strikethrough, color: 'var(--text-tertiary)', textDecoration: 'line-through' },

  // ── Links ────────────────────────────────────────────────────────────────
  { tag: t.link, color: 'var(--accent-blue)', textDecoration: 'underline' },
  { tag: t.url,  color: 'var(--accent-blue)' },

  // ── Inline code — blue (event chip colour, familiar from the app) ────────
  { tag: t.monospace, color: 'var(--chip-event-text)' },

  // ── Blockquotes ──────────────────────────────────────────────────────────
  { tag: t.quote, color: 'var(--text-secondary)', fontStyle: 'italic' },

  // ── List markers ─────────────────────────────────────────────────────────
  { tag: t.list, color: 'var(--accent-blue)', fontWeight: '600' },

  // ── Comments / HTML ──────────────────────────────────────────────────────
  { tag: t.comment, color: 'var(--text-tertiary)', fontStyle: 'italic' },
  { tag: t.meta,    color: 'var(--text-tertiary)' },

  // ── YAML frontmatter tokens ──────────────────────────────────────────────
  { tag: t.keyword,                       color: 'var(--chip-datetime-text)' }, // keys — purple
  { tag: [t.string, t.special(t.string)], color: 'var(--chip-project-text)'  }, // values — green
  { tag: t.number,                        color: 'var(--chip-deadline-text)'  }, // numbers — amber
  { tag: t.atom,                          color: 'var(--chip-event-text)'     }, // booleans — blue
  { tag: t.separator,                     color: 'var(--text-tertiary)'       },
]);

/**
 * Minimal theme that wires CodeMirror's colours to the app's CSS custom
 * properties so the editor blends with both light and dark modes.
 */
const appTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '0.9375rem',
    backgroundColor: 'var(--surface-primary)',
  },
  '.cm-scroller': {
    fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'Courier New', monospace",
    lineHeight: '1.6',
    overflow: 'auto',
  },
  '.cm-content': {
    padding: '20px',
    caretColor: 'var(--text-primary)',
    color: 'var(--text-primary)',
    minHeight: '100%',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '&.cm-focused .cm-cursor': {
    borderLeftColor: 'var(--text-primary)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--surface-primary)',
    borderRight: '1px solid var(--surface-secondary)',
    color: 'var(--text-tertiary)',
    paddingRight: '4px',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    minWidth: '2.5em',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--surface-secondary)',
  },
  '.cm-activeLine': {
    backgroundColor: 'var(--surface-secondary)',
    borderRadius: '0',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--surface-secondary)',
    borderColor: 'var(--surface-secondary)',
    color: 'var(--text-tertiary)',
  },
});

export const PlainTextEditor = forwardRef<PlainTextEditorRef, PlainTextEditorProps>(
  ({ value, onChange }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | undefined>(undefined);
    // Keep onChange in a ref so the listener closure never goes stale
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    useImperativeHandle(ref, () => ({
      focus: () => viewRef.current?.focus(),
    }));

    // Mount CodeMirror once on first render
    useEffect(() => {
      if (!containerRef.current) return;

      const view = new EditorView({
        state: EditorState.create({
          doc: value,
          extensions: [
            // basicSetup minus drawSelection — native ::selection CSS is used instead
            lineNumbers(),
            highlightActiveLineGutter(),
            highlightSpecialChars(),
            history(),
            foldGutter(),
            dropCursor(),
            indentOnInput(),
            bracketMatching(),
            closeBrackets(),
            rectangularSelection(),
            crosshairCursor(),
            highlightActiveLine(),
            highlightSelectionMatches(),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...completionKeymap, indentWithTab] as any),
            autocompletion(),
            markdown(),
            syntaxHighlighting(geraHighlightStyle),
            appTheme,
            EditorView.updateListener.of((update) => {
              if (update.docChanged) {
                onChangeRef.current(update.state.doc.toString());
              }
            }),
          ],
        }),
        parent: containerRef.current,
      });

      viewRef.current = view;
      return () => {
        view.destroy();
        viewRef.current = undefined;
      };
    // Mount once; value is synced via the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Sync externally-driven value changes (file-watcher reload, mode switch)
    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      const current = view.state.doc.toString();
      if (current === value) return;
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }, [value]);

    return <div className="plain-text-editor" ref={containerRef} />;
  }
);

PlainTextEditor.displayName = 'PlainTextEditor';
