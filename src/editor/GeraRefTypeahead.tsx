/**
 * GeraRefTypeahead — floating autocomplete for `@` references.
 *
 * Panels (explicit, chosen by user or auto-detected from typed text):
 *  - choose:    initial 2-button picker (absolute date-time / event reference)
 *  - absolute:  date input + time input → @YYYY-MM-DDTHH:MM
 *  - event-ref: relation selector (on / before / after) + amount/unit + event list
 *
 * Mounted as a Lexical composer child via addComposerChild$ in geraRefsPlugin.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createTextNode,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
} from 'lexical';
import { $isListItemNode } from '@lexical/list';
import { useAppStore } from '../stores/useAppStore';
import { $createGeraRefNode } from './GeraRefNode';
import { DateTimePicker } from '../components/shared/DateTimePicker';
import './GeraRefTypeahead.css';

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

type Panel = 'choose' | 'absolute' | 'event-ref';
type Relation = 'on' | 'before' | 'after';

interface MentionContext {
  textNodeKey: string;
  startOffset: number;
  endOffset: number;
  query: string;
  x: number;
  y: number;
}

interface EventOption {
  id: string;
  name: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

const UNITS = ['m', 'h', 'D', 'W', 'M', 'Y'] as const;
const UNIT_LABELS: Record<string, string> = {
  m: 'min', h: 'hr', D: 'day', W: 'wk', M: 'mo', Y: 'yr',
};

/** See geraRefsPlugin.ts — same helper, duplicated to avoid a shared module. */
function lockScrollTop(el: HTMLElement, savedTop: number, durationMs = 200): () => void {
  const handler = () => { el.scrollTop = savedTop; };
  el.addEventListener('scroll', handler, { passive: true });
  const id = window.setTimeout(() => el.removeEventListener('scroll', handler), durationMs);
  return () => { window.clearTimeout(id); el.removeEventListener('scroll', handler); };
}

/** Auto-detect which panel to show based on what is typed after `@`. */
function detectPanel(query: string): Panel {
  if (query.length === 0) return 'choose';
  if (/^\d{4}-/.test(query)) return 'absolute';
  return 'event-ref';
}

/** Return canonical ISO datetime if valid, else null. */
function canonicalDatetime(query: string): string | null {
  const m = query.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))$/);
  return m ? `${m[1]}T${m[2]}` : null;
}



/** Read current mention context from the Lexical selection state. */
function readMentionContext(): MentionContext | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;

  const anchorNode = selection.anchor.getNode();
  if (!$isTextNode(anchorNode)) return null;

  // Only activate on checkbox list items (task lines)
  const parent = anchorNode.getParent();
  if (!$isListItemNode(parent) || parent.getChecked() === undefined) return null;

  const text = anchorNode.getTextContent();
  const cursorOffset = selection.anchor.offset;
  const lineStart = text.lastIndexOf('\n', Math.max(0, cursorOffset - 1)) + 1;
  const segment = text.slice(lineStart, cursorOffset);
  const atIdx = segment.lastIndexOf('@');
  if (atIdx === -1) return null;

  const startOffset = lineStart + atIdx;
  const query = text.slice(startOffset + 1, cursorOffset);

  const prevChar = startOffset > 0 ? text[startOffset - 1] : '';
  if (prevChar && !/[\s([{>;,]/.test(prevChar)) return null;
  if (query.includes('\n')) return null;

  const nativeSel = window.getSelection();
  if (!nativeSel || nativeSel.rangeCount === 0) return null;
  const rect = nativeSel.getRangeAt(0).getBoundingClientRect();

  return { textNodeKey: anchorNode.getKey(), startOffset, endOffset: cursorOffset, query, x: rect.left, y: rect.bottom + 6 };
}

/* ================================================================== */
/* Component                                                            */
/* ================================================================== */

export function GeraRefTypeahead(): JSX.Element | null {
  const [editor] = useLexicalComposerContext();
  const events = useAppStore((s) => s.events);

  /* ---- state ---- */
  const [context, setContext] = useState<MentionContext | null>(null);
  const [dismissedAnchorKey, setDismissedAnchorKey] = useState<string | null>(null);
  // Panel can be forced (user clicked a chooser button) or auto-detected
  const [forcedPanel, setForcedPanel] = useState<Panel | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Event-ref form state
  const [relation, setRelation] = useState<Relation>('on');
  const [amount, setAmount] = useState(1);
  const [unit, setUnit] = useState('D');
  const [eventFilter, setEventFilter] = useState('');

  // Absolute form state
  const [absoluteValue, setAbsoluteValue] = useState('');

  const contextRef = useRef(context);
  contextRef.current = context;
  const popupRef = useRef<HTMLDivElement>(null);
  const lastAutoDatetimeRef = useRef<string | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [isPositioned, setIsPositioned] = useState(false);
  const [listMaxHeight, setListMaxHeight] = useState<number | null>(null);

  /* ---- derived ---- */
  const panel: Panel = forcedPanel ?? (context ? detectPanel(context.query) : 'choose');

  const filteredEvents = useMemo<EventOption[]>(() => {
    const q = eventFilter.trim().toLowerCase();
    const mapped = events.map((e) => ({ id: e.id, name: e.name }));
    if (!q) return mapped.slice(0, 8);
    return mapped
      .filter((e) => e.id.toLowerCase().includes(q) || e.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [eventFilter, events]);

  /* ---- reset selection when list changes ---- */
  useEffect(() => { setSelectedIndex(0); }, [eventFilter, panel]);

  /* ---- sync eventFilter from typed query for event-ref panel ---- */
  useEffect(() => {
    if (!context) return;
    if (panel === 'event-ref') {
      // Extract the event filter part from the raw query
      const q = context.query;
      // If query looks like before[...]:xxx or after[...]:xxx, pull out after `:`
      const colonMatch = q.match(/:([\w\-:]*)$/);
      if (colonMatch) {
        setEventFilter(colonMatch[1]);
      } else if (/^(before|after)/i.test(q)) {
        // Still typing the modifier, no event filter yet
        setEventFilter('');
      } else {
        // Plain text = event filter
        setEventFilter(q);
      }
    }
  }, [context, panel]);

  /* ---- listen for editor updates to detect `@` ---- */
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const ctx = readMentionContext();
        if (!ctx) {
          setContext(null);
          return;
        }
        if (dismissedAnchorKey === `${ctx.textNodeKey}:${ctx.startOffset}`) {
          setContext(null);
          return;
        }
        setContext(ctx);
      });
    });
  }, [editor, dismissedAnchorKey]);

  /* ---- when context disappears, reset panel ---- */
  useEffect(() => {
    if (!context) {
      setForcedPanel(null);
      setSelectedIndex(0);
      setEventFilter('');
      setAbsoluteValue('');
      setRelation('on');
      setAmount(1);
      setUnit('D');
      lastAutoDatetimeRef.current = null;
      setDismissedAnchorKey(null);
    }
  }, [context]);

  /* ---- auto-complete absolute when fully typed ---- */
  useEffect(() => {
    if (!context || panel !== 'absolute') return;
    const canonical = canonicalDatetime(context.query);
    if (!canonical) { lastAutoDatetimeRef.current = null; return; }
    const token = `${context.textNodeKey}:${context.startOffset}:${canonical}`;
    if (lastAutoDatetimeRef.current === token) return;
    lastAutoDatetimeRef.current = token;
    completeAbsolute(canonical);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, panel]);

  /* ---- helpers ---- */

  const replaceMentionWithChip = useCallback(
    (
      kind: 'event' | 'datetime' | 'before',
      value: string,
      options?: { offset?: string; target?: string; datetime?: string; event?: string },
    ) => {
      const ctx = contextRef.current;
      if (!ctx) return;

      // Lock scroll position for the duration of the update (BUG-007).
      // Lexical can trigger multiple reconciliation cycles (the initial update
      // plus a follow-up from the selection-watcher), each of which calls
      // setBaseAndExtent and may scroll the editor to the cursor's new position.
      // Intercepting the 'scroll' event is more reliable than a single rAF.
      const scrollEl = document.querySelector<HTMLElement>('.mdxeditor-root-contenteditable');
      if (scrollEl) lockScrollTop(scrollEl, scrollEl.scrollTop);

      editor.update(() => {
        const node = $getNodeByKey(ctx.textNodeKey);
        if (!$isTextNode(node)) return;

        const fullText = node.getTextContent();
        const beforeText = fullText.slice(0, ctx.startOffset);
        const afterText = fullText.slice(ctx.endOffset);

        const chipNode = $createGeraRefNode(
          kind, value,
          options?.offset, options?.target, options?.datetime, options?.event,
        );

        if (beforeText.length > 0) {
          node.setTextContent(beforeText);
          node.insertAfter(chipNode);
        } else {
          node.replace(chipNode);
        }

        // Cursor always ends up after the chip
        const trailingText = afterText.length > 0 ? afterText : ' ';
        const trailingNode = $createTextNode(trailingText);
        chipNode.insertAfter(trailingNode);
        const pos = afterText.length > 0 ? 0 : 1;
        trailingNode.select(pos, pos);
      });

      setContext(null);
      setDismissedAnchorKey(null);
    },
    [editor],
  );

  const completeEvent = useCallback(
    (eventId: string) => {
      if (relation === 'on') {
        replaceMentionWithChip('event', `@${eventId}`, { event: eventId });
      } else {
        const raw = `@${relation}[${amount}${unit}]:${eventId}`;
        replaceMentionWithChip('before', raw, {
          offset: `${amount}${unit}`, target: eventId, event: eventId,
        });
      }
    },
    [relation, amount, unit, replaceMentionWithChip],
  );

  const completeAbsolute = useCallback(
    (iso: string) => {
      replaceMentionWithChip('datetime', `@${iso}`, { datetime: iso });
    },
    [replaceMentionWithChip],
  );

  const dismiss = useCallback(() => {
    if (context) {
      setDismissedAnchorKey(`${context.textNodeKey}:${context.startOffset}`);
    }
    setContext(null);
  }, [context]);

  const openAbsolutePanel = useCallback(() => {
    const now = new Date();
    setForcedPanel('absolute');
    setAbsoluteValue(now.toISOString().slice(0, 16));
    setSelectedIndex(0);
  }, []);

  const openEventRefPanel = useCallback(() => {
    setForcedPanel('event-ref');
    setRelation('on');
    setAmount(1);
    setUnit('D');
    setEventFilter('');
    setSelectedIndex(0);
  }, []);

  /* ---- keyboard ---- */

  useEffect(() => {
    if (!context) return;

    const getItemCount = (): number => {
      if (panel === 'choose') return 2;
      if (panel === 'absolute') return 0;
      return filteredEvents.length;
    };

    const unregDown = editor.registerCommand(KEY_ARROW_DOWN_COMMAND, (e) => {
      const n = getItemCount();
      if (n === 0) return false;
      e?.preventDefault();
      setSelectedIndex((i) => (i + 1) % n);
      return true;
    }, COMMAND_PRIORITY_LOW);

    const unregUp = editor.registerCommand(KEY_ARROW_UP_COMMAND, (e) => {
      const n = getItemCount();
      if (n === 0) return false;
      e?.preventDefault();
      setSelectedIndex((i) => (i - 1 + n) % n);
      return true;
    }, COMMAND_PRIORITY_LOW);

    const unregEnter = editor.registerCommand(KEY_ENTER_COMMAND, (e) => {
      if (panel === 'choose') {
        e?.preventDefault();
        if (selectedIndex === 0) openAbsolutePanel();
        else openEventRefPanel();
        return true;
      }
      if (panel === 'absolute') {
        if (absoluteValue) {
          e?.preventDefault();
          completeAbsolute(absoluteValue);
          return true;
        }
        return false;
      }
      if (panel === 'event-ref' && filteredEvents.length > 0) {
        e?.preventDefault();
        const ev = filteredEvents[selectedIndex] ?? filteredEvents[0];
        completeEvent(ev.id);
        return true;
      }
      return false;
    }, COMMAND_PRIORITY_CRITICAL);

    const unregTab = editor.registerCommand(KEY_TAB_COMMAND, (e) => {
      if (panel === 'event-ref' && filteredEvents.length > 0) {
        e?.preventDefault();
        const ev = filteredEvents[selectedIndex] ?? filteredEvents[0];
        completeEvent(ev.id);
        return true;
      }
      return false;
    }, COMMAND_PRIORITY_CRITICAL);

    const unregEsc = editor.registerCommand(KEY_ESCAPE_COMMAND, (e) => {
      e?.preventDefault();
      dismiss();
      return true;
    }, COMMAND_PRIORITY_LOW);

    return () => { unregDown(); unregUp(); unregEnter(); unregTab(); unregEsc(); };
  }, [context, panel, filteredEvents, selectedIndex, editor, dismiss, completeEvent, completeAbsolute, openAbsolutePanel, openEventRefPanel, absoluteValue]);

  /* ---- click outside ---- */
  useEffect(() => {
    if (!context) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      // Also exclude the DateTimePicker portal which renders in document.body
      // outside the typeahead's DOM subtree (BUG-006).
      if (
        popupRef.current && !popupRef.current.contains(target) &&
        !(target as Element).closest?.('.dtp-popover')
      ) dismiss();
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [context, dismiss]);

  /* ---- position & measurement ---- */
  useLayoutEffect(() => {
    if (!context || !popupRef.current) {
      setIsPositioned(false);
      setPosition(null);
      setListMaxHeight(null);
      return;
    }

    const el = popupRef.current;
    const margin = 8;

    const compute = () => {
      const rect = el.getBoundingClientRect();
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const popupW = rect.width || 280;
      const popupH = rect.height || 200;

      let left = Math.min(context.x, viewportW - popupW - margin);
      left = Math.max(margin, left);

      const belowSpace = viewportH - context.y;
      let top: number;
      if (popupH + margin <= belowSpace) {
        top = context.y;
      } else {
        // prefer above if it fits
        if (context.y >= popupH + margin) {
          top = context.y - popupH - 6;
        } else {
          // clamp inside viewport
          top = Math.max(margin, Math.min(context.y, viewportH - popupH - margin));
        }
      }

      // compute a reasonable max-height for the event list
      let listMax: number | null = null;
      if (panel === 'event-ref') {
        const available = top >= context.y ? (viewportH - context.y - margin) : (context.y - margin);
        const listEl = el.querySelector('.gera-typeahead__list') as HTMLElement | null;
        const otherHeight = listEl ? Math.max(0, rect.height - listEl.getBoundingClientRect().height) : 80;
        const computed = Math.max(80, available - otherHeight - 8);
        listMax = Math.max(80, Math.min(computed, 600));
      }

      setPosition({ top, left });
      setListMaxHeight(listMax);
      setIsPositioned(true);
    };

    compute();

    const onResize = () => {
      setIsPositioned(false);
      compute();
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [context, panel, filteredEvents.length, absoluteValue, relation, amount, unit, eventFilter]);

  /* ---- render ---- */

  if (!context) return null;

  const popupWidth = 280;
  const fallbackLeft = Math.min(context.x, window.innerWidth - popupWidth - 16);
  const styleTop = isPositioned && position ? position.top : context.y;
  const styleLeft = isPositioned && position ? position.left : fallbackLeft;
  const visibility = isPositioned ? 'visible' : 'hidden';

  return (
    <div
      ref={popupRef}
      className="gera-typeahead"
      style={{ position: 'fixed', top: styleTop, left: styleLeft, zIndex: 2000, visibility }}
      onMouseDown={(e) => {
        // Keep editor focus, but allow native interaction with inputs/selects
        const t = e.target as HTMLElement;
        if (!(t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLButtonElement)) {
          e.preventDefault();
        }
      }}
    >
      {/* ---- CHOOSER ---- */}
      {panel === 'choose' && (
        <div className="gera-typeahead__chooser">
          <div className="gera-typeahead__hint">Choose reference type</div>
          <button
            type="button"
            className={`gera-typeahead__option ${selectedIndex === 0 ? 'gera-typeahead__option--selected' : ''}`}
            onMouseEnter={() => setSelectedIndex(0)}
            onClick={openAbsolutePanel}
          >
            <span className="gera-typeahead__option-icon">📅</span>
            <span>
              <strong>Absolute datetime</strong>
              <small>@2026-03-04T18:00</small>
            </span>
          </button>
          <button
            type="button"
            className={`gera-typeahead__option ${selectedIndex === 1 ? 'gera-typeahead__option--selected' : ''}`}
            onMouseEnter={() => setSelectedIndex(1)}
            onClick={openEventRefPanel}
          >
            <span className="gera-typeahead__option-icon">🔗</span>
            <span>
              <strong>Event reference</strong>
              <small>@event-id or @before[2d]:id</small>
            </span>
          </button>
        </div>
      )}

      {/* ---- ABSOLUTE DATE-TIME ---- */}
      {panel === 'absolute' && (
        <div className="gera-typeahead__absolute">
          <DateTimePicker
            value={absoluteValue}
            onChange={setAbsoluteValue}
          />
          <div className="gera-typeahead__absolute-actions">
            <button
              type="button"
              className="gera-typeahead__insert-btn"
              disabled={!absoluteValue}
              onClick={() => absoluteValue && completeAbsolute(absoluteValue)}
            >
              Insert
            </button>
          </div>
        </div>
      )}

      {/* ---- EVENT REFERENCE ---- */}
      {panel === 'event-ref' && (
        <div className="gera-typeahead__event-ref">
          <div className="gera-typeahead__relation-row">
            {(['on', 'before', 'after'] as Relation[]).map((r) => (
              <button
                key={r}
                type="button"
                className={`gera-typeahead__relation-btn ${relation === r ? 'gera-typeahead__relation-btn--active' : ''}`}
                onClick={() => setRelation(r)}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Amount + unit row, grayed out when relation is "on" */}
          <div className={`gera-typeahead__modifier-row ${relation === 'on' ? 'gera-typeahead__modifier-row--disabled' : ''}`}>
            <input
              type="number"
              className="gera-typeahead__number"
              min={1}
              value={amount}
              disabled={relation === 'on'}
              onChange={(e) => setAmount(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
            />
            <select
              className="gera-typeahead__select"
              value={unit}
              disabled={relation === 'on'}
              onChange={(e) => setUnit(e.target.value)}
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>{UNIT_LABELS[u]}</option>
              ))}
            </select>
          </div>

          <div className="gera-typeahead__hint">Select an event</div>
          {filteredEvents.length === 0 ? (
            <div className="gera-typeahead__empty">No matching events</div>
            ) : (
            <ul
              className="gera-typeahead__list"
              role="listbox"
              style={listMaxHeight ? { maxHeight: `${listMaxHeight}px` } : undefined}
            >
              {filteredEvents.map((ev, i) => (
                <li
                  key={ev.id}
                  role="option"
                  aria-selected={i === selectedIndex}
                  className={`gera-typeahead__item ${i === selectedIndex ? 'gera-typeahead__item--selected' : ''}`}
                  onMouseEnter={() => setSelectedIndex(i)}
                  onClick={() => completeEvent(ev.id)}
                >
                  <span className="gera-typeahead__item-name">{ev.name}</span>
                  <span className="gera-typeahead__item-id">{ev.id}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
