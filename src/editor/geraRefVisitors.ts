/**
 * Visitors for converting Gera references between mdast and Lexical formats.
 *
 * - MdastToLexical: mdast `geraRef` nodes → Lexical `GeraRefNode`
 * - LexicalToMdast: Lexical `GeraRefNode` → mdast text node (preserves raw syntax on export)
 */

import { LexicalNode } from 'lexical';
import {
  GeraRefNode,
  $createGeraRefNode,
  $isGeraRefNode,
} from './GeraRefNode';

/**
 * Custom mdast node type for Gera references.
 */
export interface GeraRefMdastNode {
  type: 'geraRef';
  kind: 'before' | 'datetime' | 'event' | 'project';
  value: string;
  offset?: string;
  target?: string;
  datetime?: string;
  event?: string;
  project?: string;
}

/**
 * Visitor that converts mdast `geraRef` nodes to Lexical `GeraRefNode`.
 * Called during mdast import (when loading markdown into the editor).
 *
 * @param mdastNode The mdast `geraRef` node
 * @returns Lexical node to insert, or null to skip
 */
export function mdastToLexicalGeraRef(
  mdastNode: GeraRefMdastNode
): GeraRefNode | null {
  if (!mdastNode || mdastNode.type !== 'geraRef') {
    return null;
  }

  return $createGeraRefNode(
    mdastNode.kind,
    mdastNode.value,
    mdastNode.offset,
    mdastNode.target,
    mdastNode.datetime,
    mdastNode.event,
    mdastNode.project
  );
}

/**
 * Visitor that converts Lexical `GeraRefNode` to mdast representation.
 * On export, we reconstruct the original syntax so the markdown is clean.
 *
 * Examples:
 * - event: "@event-id" → raw text "@event-id"
 * - datetime: "@2026-03-01T09:00" → raw text "@2026-03-01T09:00"
 * - before: "@before[2d]:event-id" → raw text "@before[2d]:event-id"
 * - project: "#project-id" → raw text "#project-id"
 *
 * @param lexicalNode The Lexical `GeraRefNode`
 * @returns mdast text node with reconstructed syntax
 */
export function lexicalToMdastGeraRef(
  lexicalNode: LexicalNode
): { type: 'text'; value: string } | null {
  if (!$isGeraRefNode(lexicalNode)) {
    return null;
  }

  const node = lexicalNode as GeraRefNode;

  // Reconstruct the original syntax
  let rawSyntax = node.__value; // Might already be the full syntax

  // If __value is just the id/datetime, reconstruct based on __kind
  switch (node.__kind) {
    case 'before':
      // Format: "@before[offset]:target"
      if (node.__offset && node.__target) {
        rawSyntax = `@before[${node.__offset}]:${node.__target}`;
      }
      break;

    case 'datetime':
      // Format: "@YYYY-MM-DDTHH:MM" or "@before[offset]:datetime"
      if (node.__datetime) {
        rawSyntax = `@${node.__datetime}`;
      }
      break;

    case 'event':
      // Format: "@event-id"
      if (node.__event) {
        rawSyntax = `@${node.__event}`;
      }
      break;

    case 'project':
      // Format: "#project-id"
      if (node.__project) {
        rawSyntax = `#${node.__project}`;
      }
      break;
  }

  return {
    type: 'text',
    value: rawSyntax,
  };
}

/**
 * A map of visitor functions for Lexical → mdast conversion.
 * Used when exporting the editor content back to markdown.
 */
export const lexicalToMdastVisitors = {
  geraRef: lexicalToMdastGeraRef,
};

/**
 * A map of visitor functions for mdast → Lexical conversion.
 * Used when importing markdown into the editor.
 */
export const mdastToLexicalVisitors = {
  geraRef: mdastToLexicalGeraRef,
};
