/**
 * GeraRefChip component — renders Gera references as styled inline elements.
 *
 * Supports four kinds:
 * - event: @event-id (blue)
 * - datetime: @2026-03-01T09:00 (green)
 * - before: @before[2d]:event-id (orange)
 * - project: #project-id (purple)
 */

import { useAppStore } from '../stores/useAppStore';
import { GeraRefKind } from './GeraRefNode';
import { ClockIcon } from '../components/icons/Icons';
import { formatEventDate, formatEventTime } from '../utils/dateFormatting';
import './GeraRefChip.css';

export interface GeraRefChipProps {
  kind: GeraRefKind;
  value: string;
  offset?: string;
  target?: string;
  datetime?: string;
  event?: string;
  project?: string;
}

/**
 * Renders a single Gera reference as a styled chip.
 * Used by GeraRefNode's decorate() method.
 */
export function GeraRefChip({
  kind,
  value,
  offset,
  target,
  datetime,
  event,
  project,
}: GeraRefChipProps): JSX.Element {
  const events = useAppStore((s) => s.events);

  // Determine the display text based on kind
  let displayText = value;

  switch (kind) {
    case 'event': {
      const eventName = event ? events.find((e) => e.id === event)?.name : undefined;
      displayText = eventName ? `@${eventName}` : (event ? `@${event}` : value);
      break;
    }
    case 'datetime':
      if (datetime) {
        const d = new Date(datetime);
        displayText = `${formatEventDate(d)} ${formatEventTime(d)}`;
      }
      break;
    case 'before':
      // Handles both @before[2d]:id and @after[2d]:id
      // Build clean display from offset+target, fall back to raw value
      if (offset && target) {
        const modifier = value.startsWith('@after') ? 'after' : 'before';
        displayText = `@${modifier}[${offset}]:${target}`;
      } else {
        // Strip any escape chars / HTML entities from raw value
        displayText = value
          .replace(/\\([[\]])/g, '$1')
          .replace(/&#x20;/g, '')
          .trim();
      }
      break;
    case 'project':
      displayText = project ? `#${project}` : value;
      break;
  }

  return (
    <span
      className={`gera-ref-chip gera-ref-chip--${kind}`}
      title={`Gera ${kind} reference`}
      contentEditable={false}
    >
      {kind === 'datetime' && <ClockIcon />}
      {displayText}
    </span>
  );
}
