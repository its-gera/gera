/**
 * Lexical DecoratorNode for Gera references (@event-id, @datetime, @before[...]:id, #project-id).
 *
 * This node is non-editable (atomic) — users can select and delete it but cannot type inside it.
 * It renders as an inline <span> element styled as a chip.
 */

import {
  DecoratorNode,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
} from 'lexical';
import { GeraRefChip } from './GeraRefChip';

export type GeraRefKind = 'before' | 'datetime' | 'event' | 'project';

interface GeraRefNodeSerializedData {
  kind: GeraRefKind;
  value: string;
  offset?: string;
  target?: string;
  datetime?: string;
  event?: string;
  project?: string;
}

/**
 * Serialized version of GeraRefNode for JSON storage.
 */
export interface SerializedGeraRefNode extends SerializedLexicalNode {
  type: 'gera-ref';
  version: 1;
  data: GeraRefNodeSerializedData;
}

/**
 * Lexical DecoratorNode for rendering Gera references as styled inline chips.
 */
export class GeraRefNode extends DecoratorNode<JSX.Element> {
  __kind: GeraRefKind;
  __value: string;
  __offset?: string;
  __target?: string;
  __datetime?: string;
  __event?: string;
  __project?: string;

  constructor(
    kind: GeraRefKind,
    value: string,
    offset?: string,
    target?: string,
    datetime?: string,
    event?: string,
    project?: string,
    key?: NodeKey
  ) {
    super(key);
    this.__kind = kind;
    this.__value = value;
    this.__offset = offset;
    this.__target = target;
    this.__datetime = datetime;
    this.__event = event;
    this.__project = project;
  }

  static getType(): string {
    return 'gera-ref';
  }

  static clone(node: GeraRefNode): GeraRefNode {
    return new GeraRefNode(
      node.__kind,
      node.__value,
      node.__offset,
      node.__target,
      node.__datetime,
      node.__event,
      node.__project,
      node.__key
    );
  }

  createDOM(): HTMLElement {
    const span = document.createElement('span');
    // Bare wrapper — decorate() handles all visible content via GeraRefChip.
    span.style.display = 'inline';
    return span;
  }

  updateDOM(): false {
    return false;
  }

  decorate(): JSX.Element {
    return (
      <GeraRefChip
        kind={this.__kind}
        value={this.__value}
        offset={this.__offset}
        target={this.__target}
        datetime={this.__datetime}
        event={this.__event}
        project={this.__project}
      />
    );
  }

  exportJSON(): SerializedGeraRefNode {
    return {
      type: 'gera-ref',
      version: 1,
      data: {
        kind: this.__kind,
        value: this.__value,
        offset: this.__offset,
        target: this.__target,
        datetime: this.__datetime,
        event: this.__event,
        project: this.__project,
      },
    };
  }

  static importJSON(json: SerializedGeraRefNode): GeraRefNode {
    const { data } = json;
    const node = new GeraRefNode(
      data.kind,
      data.value,
      data.offset,
      data.target,
      data.datetime,
      data.event,
      data.project
    );
    return node;
  }

  isInline(): boolean {
    return true;
  }

  isKeyboardSelectable(): boolean {
    return true;
  }

  getTextContent(): string {
    return this.__value;
  }

  // Prevent text replacement within the node
  canInsertTextBefore(): boolean {
    return false;
  }

  canInsertTextAfter(): boolean {
    return false;
  }
}

/**
 * Helper function to create a GeraRefNode.
 */
export function $createGeraRefNode(
  kind: GeraRefKind,
  value: string,
  offset?: string,
  target?: string,
  datetime?: string,
  event?: string,
  project?: string
): GeraRefNode {
  return new GeraRefNode(kind, value, offset, target, datetime, event, project);
}

/**
 * Helper function to check if a node is a GeraRefNode.
 */
export function $isGeraRefNode(
  node: LexicalNode | null | undefined
): node is GeraRefNode {
  return node instanceof GeraRefNode;
}
