/**
 * NoteEditor component — rich-text or plain-text (Markdown) editor.
 *
 * Features:
 * - Rich mode: MDXEditor with full formatting support + Gera reference chips
 * - Plain mode: CodeMirror 6 textarea with Markdown syntax highlighting
 * - Toggle between modes (preference persisted to localStorage)
 * - Debounced autosave to backend
 * - Preserve YAML frontmatter
 * - Support for task lists (checkboxes) in rich mode
 * - Reload editor content on external / backend saves (R5)
 */

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import {
  MDXEditor,
  MDXEditorMethods,
  headingsPlugin,
  listsPlugin,
  linkPlugin,
  quotePlugin,
  thematicBreakPlugin,
  markdownShortcutPlugin,
  codeBlockPlugin,
  codeMirrorPlugin,
  toolbarPlugin,
  UndoRedo,
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  CodeToggle,
  CreateLink,
  InsertCodeBlock,
  InsertThematicBreak,
  InsertTable,
  ListsToggle,
  Separator,
  tablePlugin,
} from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';
import { getNoteContent, updateNoteContent } from '../api';
import { parseFrontmatter } from '../utils/frontmatter';
import { geraRefsPlugin } from './geraRefsPlugin';
import { useAppStore } from '../stores/useAppStore';
import { PlainTextEditor, PlainTextEditorRef } from './PlainTextEditor';
import './NoteEditor.css';

export type EditorMode = 'rich' | 'plain';

/**
 * Mirror the Python backend's `_sanitize_content`:
 *   1. Replace all &#x20; HTML entities with a plain space.
 *   2. Strip trailing horizontal whitespace from every line.
 */
function sanitizeContent(content: string): string {
  return content
    .replace(/&#x20;/g, ' ')
    .replace(/[ \t]+$/gm, '');
}

export interface NoteEditorRef {
  switchToRich(): void;
  switchToPlain(): void;
}

export interface NoteEditorProps {
  filename: string;
  content: string;
  eventIds?: string[];
  projectIds?: string[];
  onSave?: (content: string) => void;
  onClose?: () => void;
  autoSave?: boolean;
  autoSaveDelay?: number;
  /** Controlled mode — when provided, NoteEditor won't render its own toggle. */
  mode?: EditorMode;
  onModeChange?: (mode: EditorMode) => void;
}

export const NoteEditor = forwardRef<NoteEditorRef, NoteEditorProps>(function NoteEditor({
  filename,
  content,
  eventIds = [],
  projectIds = [],
  onSave,
  onClose: _onClose,
  autoSave = true,
  autoSaveDelay = 1000,
  mode: modeProp,
  onModeChange,
}: NoteEditorProps, ref: React.Ref<NoteEditorRef>): JSX.Element {
  const editorRef = useRef<MDXEditorMethods>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Holds the pending save fn so the unmount cleanup can flush it without waiting for the debounce
  const pendingSaveRef = useRef<(() => Promise<void>) | null>(null);
  // Tracks the last body we wrote to disk — guards against reload loops
  const lastSavedBodyRef = useRef<string>(content);
  // Always holds the latest in-editor content regardless of mode
  const currentContentRef = useRef<string>(content);

  // ── Mode ─────────────────────────────────────────────────────────────────
  // Internal state is used when the parent doesn't control mode via props.
  const [internalMode, setInternalMode] = useState<EditorMode>(
    () => (localStorage.getItem('noteEditorMode') as EditorMode) ?? 'rich'
  );
  const mode: EditorMode = modeProp ?? internalMode;
  // Ref copy so event-listener callbacks can read mode without stale closures
  const modeRef = useRef<EditorMode>(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  // Value shown in the plain editor — only updated externally (mode switch,
  // file-watcher reload). CodeMirror manages its own internal state while typing.
  const [plainValue, setPlainValue] = useState(content);

  // When switching plain → rich, store the content to restore after MDXEditor mounts
  const pendingRichContentRef = useRef<string | null>(null);

  const plainEditorRef = useRef<PlainTextEditorRef>(null);

  const focusLine = useAppStore((state) => state.focusLine);
  const setFocusLine = useAppStore((state) => state.setFocusLine);

  // ── Mode switching ────────────────────────────────────────────────────────

  function switchToPlain() {
    const raw = editorRef.current?.getMarkdown() ?? currentContentRef.current;
    const current = sanitizeContent(raw);
    currentContentRef.current = current;
    setPlainValue(current);
    setInternalMode('plain');
    onModeChange?.('plain');
    localStorage.setItem('noteEditorMode', 'plain');
    setTimeout(() => plainEditorRef.current?.focus(), 50);
  }

  function switchToRich() {
    // Capture latest plain content; MDXEditor will load it once mounted
    pendingRichContentRef.current = currentContentRef.current;
    setInternalMode('rich');
    onModeChange?.('rich');
    localStorage.setItem('noteEditorMode', 'rich');
  }

  useImperativeHandle(ref, () => ({ switchToRich, switchToPlain }));

  // After switching to rich mode, inject any pending content into MDXEditor
  useEffect(() => {
    if (mode !== 'rich') return;
    if (pendingRichContentRef.current === null) return;
    const pending = pendingRichContentRef.current;
    pendingRichContentRef.current = null;
    const t = setTimeout(() => editorRef.current?.setMarkdown(pending), 50);
    return () => clearTimeout(t);
  }, [mode]);

  // ── Auto-focus on mount ───────────────────────────────────────────────────
  useEffect(() => {
    if (mode === 'plain') {
      const t = setTimeout(() => plainEditorRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => editorRef.current?.focus(), 80);
    return () => clearTimeout(t);
  // Run once on mount; mode is intentionally captured from initial render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Scroll preservation (rich mode) ──────────────────────────────────────
  // Preserve scroll position when a task-list checkbox is toggled.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Element;
      const isCheckbox =
        target.closest('li[role="checkbox"]') != null ||
        (target instanceof HTMLInputElement && target.type === 'checkbox');
      if (!isCheckbox) return;
      const scroll = el.querySelector<HTMLElement>('.mdxeditor-root-contenteditable');
      if (!scroll) return;
      const savedTop = scroll.scrollTop;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => { scroll.scrollTop = savedTop; });
      });
    };
    el.addEventListener('mousedown', onMouseDown);
    return () => el.removeEventListener('mousedown', onMouseDown);
  }, []);

  // ── focusLine (cross-reference navigation) ────────────────────────────────
  useEffect(() => {
    if (focusLine === null) return;
    // Plain mode: no DOM-walk support yet — just clear the request
    if (modeRef.current === 'plain') {
      setFocusLine(null);
      return;
    }

    let attempts = 0;
    const MAX_ATTEMPTS = 10;
    const INTERVAL_MS = 120;

    const tryScroll = () => {
      const container = document.querySelector('.mdxeditor-root-contenteditable');
      if (!container) {
        if (++attempts < MAX_ATTEMPTS) { timerId = window.setTimeout(tryScroll, INTERVAL_MS); }
        else { setFocusLine(null); }
        return;
      }
      const taskItems = container.querySelectorAll<HTMLElement>('li[role="checkbox"]');
      const target = taskItems[focusLine] ?? null;
      if (!target) {
        if (++attempts < MAX_ATTEMPTS) { timerId = window.setTimeout(tryScroll, INTERVAL_MS); }
        else { setFocusLine(null); }
        return;
      }
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.add('task-line-highlight');
      setTimeout(() => target.classList.remove('task-line-highlight'), 2500);
      setFocusLine(null);
    };

    let timerId = window.setTimeout(tryScroll, 200);
    return () => window.clearTimeout(timerId);
  }, [focusLine, setFocusLine]);

  // ── Debounced save ────────────────────────────────────────────────────────
  const handleAutoSave = useCallback(
    (newContent: string) => {
      // Always keep currentContentRef up to date for mode switching
      currentContentRef.current = newContent;

      if (!autoSave) return;

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      const doSave = async () => {
        try {
          const cleanedContent = sanitizeContent(newContent);

          let fullContent = cleanedContent;
          if (eventIds.length > 0 || projectIds.length > 0) {
            const frontmatterLines: string[] = ['---'];
            if (eventIds.length > 0) {
              frontmatterLines.push('event_ids:');
              eventIds.forEach(id => frontmatterLines.push(`  - ${id}`));
            }
            if (projectIds.length > 0) {
              frontmatterLines.push('project_ids:');
              projectIds.forEach(id => frontmatterLines.push(`  - ${id}`));
            }
            frontmatterLines.push('---', '');
            fullContent = frontmatterLines.join('\n') + cleanedContent;
          }

          lastSavedBodyRef.current = cleanedContent;
          await updateNoteContent(filename, fullContent);
          onSave?.(fullContent);
        } catch (err) {
          console.error('Failed to save note:', err);
        }
      };

      // Store so the unmount cleanup can flush this save immediately if needed
      pendingSaveRef.current = doSave;

      saveTimeoutRef.current = setTimeout(async () => {
        saveTimeoutRef.current = null;
        pendingSaveRef.current = null;
        await doSave();
      }, autoSaveDelay);
    },
    [filename, autoSave, autoSaveDelay, onSave, eventIds, projectIds]
  );

  // Flush any pending save on unmount so navigating away quickly doesn't lose changes
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
        const flush = pendingSaveRef.current;
        pendingSaveRef.current = null;
        flush?.();
      }
    };
  }, []);

  // ── External reload (R5) ──────────────────────────────────────────────────
  useEffect(() => {
    const unlisten = listen<{ changes: { entity: string; ids: string[] | null }[] }>(
      'gera://data-changed',
      async () => {
        try {
          const result = await getNoteContent(filename);
          const { body } = parseFrontmatter(result.raw_content);

          if (body === lastSavedBodyRef.current) return;

          lastSavedBodyRef.current = body;
          currentContentRef.current = body;

          if (modeRef.current === 'plain') {
            // Plain mode: update controlled value; CodeMirror syncs via useEffect
            setPlainValue(body);
            return;
          }

          // Rich mode: update MDXEditor while preserving scroll position
          const current = editorRef.current?.getMarkdown() ?? '';
          if (body === current) return;

          const scrollEl = document.querySelector<HTMLElement>('.mdxeditor-root-contenteditable');
          const savedScrollTop = scrollEl?.scrollTop ?? 0;
          editorRef.current?.setMarkdown(body);
          requestAnimationFrame(() => {
            if (scrollEl) scrollEl.scrollTop = savedScrollTop;
          });
        } catch (err) {
          console.error('Failed to reload note on external change:', err);
        }
      }
    );
    return () => { unlisten.then((fn) => fn()); };
  }, [filename]);

  // ── MDXEditor plugins ─────────────────────────────────────────────────────
  const plugins = [
    geraRefsPlugin(),
    toolbarPlugin({
      toolbarContents: () => (
        <>
          <UndoRedo />
          <Separator />
          <BoldItalicUnderlineToggles />
          <Separator />
          <BlockTypeSelect />
          <Separator />
          <CodeToggle />
          <Separator />
          <CreateLink />
          <Separator />
          <ListsToggle />
          <Separator />
          <InsertCodeBlock />
          <Separator />
          <InsertThematicBreak />
          <Separator />
          <InsertTable />
        </>
      ),
    }),
    headingsPlugin(),
    listsPlugin(),
    linkPlugin(),
    quotePlugin(),
    thematicBreakPlugin(),
    codeBlockPlugin({ defaultCodeBlockLanguage: 'python' }),
    codeMirrorPlugin({
      codeBlockLanguages: {
        python: 'Python',
        javascript: 'JavaScript',
        typescript: 'TypeScript',
        bash: 'Bash',
        json: 'JSON',
        yaml: 'YAML',
      },
    }),
    tablePlugin(),
    markdownShortcutPlugin(),
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="note-editor" ref={containerRef}>
      {mode === 'rich' ? (
        <MDXEditor
          ref={editorRef}
          markdown={content}
          onChange={handleAutoSave}
          plugins={plugins}
        />
      ) : (
        <PlainTextEditor
          ref={plainEditorRef}
          value={plainValue}
          onChange={handleAutoSave}
        />
      )}
    </div>
  );
});
