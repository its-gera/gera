import { useCallback, useEffect, useState } from "react";
import { renderMarkdown, type RenderMarkdownResponse } from "./api";

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseMarkdownResult {
  /** Rendered HTML string (empty while loading). */
  html: string;
  /** Document title extracted from the first H1 or first few words. */
  title: string;
  /** Parsed YAML frontmatter. */
  frontmatter: Record<string, unknown>;
  /** Event IDs from frontmatter. */
  eventIds: string[];
  /** Project IDs from frontmatter. */
  projectIds: string[];
  /** True while waiting for the backend response. */
  loading: boolean;
  /** Error message if the render call failed. */
  error: string | null;
  /** Re-render with new content. */
  render: (content: string) => void;
}

/**
 * React hook that renders Gera-flavoured markdown via the Python backend.
 *
 * @param initialContent - If provided, rendered immediately on mount.
 */
export function useMarkdown(initialContent?: string): UseMarkdownResult {
  const [html, setHtml] = useState("");
  const [title, setTitle] = useState("");
  const [frontmatter, setFrontmatter] = useState<Record<string, unknown>>({});
  const [eventIds, setEventIds] = useState<string[]>([]);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const render = useCallback(async (content: string) => {
    setLoading(true);
    setError(null);
    try {
      const res: RenderMarkdownResponse = await renderMarkdown(content);
      setHtml(res.html);
      setTitle(res.title);
      setFrontmatter(res.frontmatter);
      setEventIds(res.event_ids);
      setProjectIds(res.project_ids);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialContent !== undefined) {
      render(initialContent);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { html, title, frontmatter, eventIds, projectIds, loading, error, render };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface MarkdownPreviewProps {
  /** Raw markdown content (including optional YAML frontmatter). */
  content: string;
  /** Optional CSS class for the outer wrapper. */
  className?: string;
  /** Show the document title extracted from H1 above the body. */
  showTitle?: boolean;
  /** Show frontmatter metadata badges (event_ids / project_ids). */
  showMeta?: boolean;
}

/**
 * Renders Gera-flavoured Markdown to HTML via the Python backend.
 *
 * Gera-specific inline references (`@event-id`, `@before[2d]:event-id`,
 * `@datetime`, `#project-id`) are wrapped in semantic `<span>` elements
 * that can be styled and wired to navigation.
 */
export function MarkdownPreview({
  content,
  className,
  showTitle = false,
  showMeta = false,
}: MarkdownPreviewProps) {
  const { html, title, eventIds, projectIds, loading, error, render } =
    useMarkdown();

  useEffect(() => {
    render(content);
  }, [content, render]);

  if (loading) {
    return <div className={`md-preview md-preview--loading ${className ?? ""}`}>Rendering…</div>;
  }

  if (error) {
    return <div className={`md-preview md-preview--error ${className ?? ""}`}>Render error: {error}</div>;
  }

  return (
    <div className={`md-preview ${className ?? ""}`}>
      {showTitle && title && <h1 className="md-preview__title">{title}</h1>}

      {showMeta && (eventIds.length > 0 || projectIds.length > 0) && (
        <div className="md-preview__meta">
          {eventIds.map((id) => (
            <span key={id} className="md-badge md-badge--event">@{id}</span>
          ))}
          {projectIds.map((id) => (
            <span key={id} className="md-badge md-badge--project">#{id}</span>
          ))}
        </div>
      )}

      <div
        className="md-preview__body"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
