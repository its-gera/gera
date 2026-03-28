/**
 * Remark plugin for Gera reference syntax.
 *
 * Transforms Gera-specific inline syntax (@event-id, @datetime, @before[...]:id, #project-id)
 * into custom mdast nodes for MDXEditor to handle.
 *
 * Patterns (in order of application):
 * 1. @before[OFFSET]:TARGET — @before[2d]:event-id
 * 2. @DATETIME — @2026-03-01T09:00
 * 3. @EVENT-ID — @design-review (negative lookahead prevents matching @before)
 * 4. #PROJECT-ID — #dashboard-redesign
 */

import { visit } from 'unist-util-visit';
import type { Plugin } from 'unified';
import type { Root, Text } from 'mdast';

// Regex patterns (same order as renderer.py)
const BEFORE_REF_RE = /@before\[(\d+[YMWDhm])\]:([\w][\w:.\-]*)/g;
const DATETIME_REF_RE = /@(\d{4}-\d{1,2}-\d{1,2}T\d{2}:\d{2})/g;
const EVENT_REF_RE = /@(?!before\[|after\[|\d{4}-)([a-zA-Z0-9][\w\-]*)/g;
const PROJECT_TAG_RE = /#([a-zA-Z][\w\-]*)/g;

interface GeraRefNode extends Record<string, any> {
  type: 'geraRef';
  kind: 'before' | 'datetime' | 'event' | 'project';
  value: string;
  data: Record<string, string>;
}

/**
 * Remark plugin that replaces Gera reference patterns with custom mdast nodes.
 */
export const remarkGeraRefs: Plugin<[], Root> = () => (tree: Root) => {
  visit(tree, 'text', (node: Text, index: number | undefined, parent: any) => {
    if (index === undefined || !parent) return;

    const text = node.value;
    const newChildren: (Text | GeraRefNode)[] = [];

    // Collect all matches across all patterns
    interface Match {
      start: number;
      end: number;
      kind: 'before' | 'datetime' | 'event' | 'project';
      value: string;
      data: Record<string, string>;
    }

    const matches: Match[] = [];

    // Find @before[OFFSET]:TARGET matches
    let match: RegExpExecArray | null;
    while ((match = BEFORE_REF_RE.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        kind: 'before',
        value: match[0],
        data: { offset: match[1], target: match[2] },
      });
    }

    // Find @DATETIME matches
    while ((match = DATETIME_REF_RE.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        kind: 'datetime',
        value: match[0],
        data: { datetime: match[1] },
      });
    }

    // Find @EVENT-ID matches
    while ((match = EVENT_REF_RE.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        kind: 'event',
        value: match[0],
        data: { event: match[1] },
      });
    }

    // Find #PROJECT-ID matches
    while ((match = PROJECT_TAG_RE.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        kind: 'project',
        value: match[0],
        data: { project: match[1] },
      });
    }

    // If no matches, return early
    if (matches.length === 0) {
      return;
    }

    // Sort matches by start position
    matches.sort((a, b) => a.start - b.start);

    // Build new children array
    let pos = 0;
    for (const m of matches) {
      // Add text before this match
      if (m.start > pos) {
        newChildren.push({
          type: 'text',
          value: text.slice(pos, m.start),
        });
      }

      // Add the geraRef node
      newChildren.push({
        type: 'geraRef',
        kind: m.kind,
        value: m.value,
        data: m.data,
      } as GeraRefNode);

      pos = m.end;
    }

    // Add remaining text
    if (pos < text.length) {
      newChildren.push({
        type: 'text',
        value: text.slice(pos),
      });
    }

    // Replace the text node with the new children
    parent.children.splice(index, 1, ...newChildren);
  });
};


