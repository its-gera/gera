/**
 * YAML frontmatter parsing utilities for client-side.
 * Matches the Python frontmatter.py logic.
 */

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?/;

export interface ParsedFrontmatter {
  metadata: {
    event_ids?: string[];
    project_ids?: string[];
    [key: string]: any;
  };
  body: string;
}

/**
 * Parse YAML frontmatter from markdown content.
 * Returns the frontmatter metadata and the body without frontmatter.
 */
export function parseFrontmatter(content: string): ParsedFrontmatter {
  const match = content.match(FRONTMATTER_RE);
  
  if (!match) {
    return {
      metadata: {},
      body: content,
    };
  }

  const yamlStr = match[1];
  const body = content.slice(match[0].length);

  try {
    // Simple YAML parsing for our use case (event_ids, project_ids lists)
    const metadata: any = {};
    let currentKey: string | null = null;
    
    for (const line of yamlStr.split('\n')) {
      const trimmed = line.trim();
      
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      // Key: value or Key:
      if (line[0] !== ' ' && line[0] !== '-') {
        const colonIdx = line.indexOf(':');
        if (colonIdx !== -1) {
          currentKey = line.slice(0, colonIdx).trim();
          const value = line.slice(colonIdx + 1).trim();
          if (value) {
            metadata[currentKey] = value;
            currentKey = null;
          } else {
            metadata[currentKey] = [];
          }
        }
      }
      // List item
      else if (trimmed.startsWith('-') && currentKey) {
        const item = trimmed.slice(1).trim();
        if (item) {
          metadata[currentKey].push(item);
        }
      }
    }

    return {
      metadata,
      body,
    };
  } catch (e) {
    // If parsing fails, treat whole content as body
    return {
      metadata: {},
      body: content,
    };
  }
}
