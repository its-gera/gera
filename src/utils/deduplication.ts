/**
 * Deduplication utilities for hybrid search results.
 * Uses source_file + line_number + text_hash as the unique identifier.
 */

/**
 * Generate a simple hash of text for deduplication purposes (browser-compatible)
 */
export function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16);
}

/**
 * Generate a unique key for deduplication: source_file:line_number:text_hash
 */
export function generateDedupeKey(sourceFile: string, lineNumber: number, text: string): string {
  const textHash = hashText(text);
  return `${sourceFile}:${lineNumber}:${textHash}`;
}

/**
 * Generate key for task deduplication
 */
export function getTaskDedupeKey(task: any): string {
  return generateDedupeKey(task.source_file, task.line_number, task.text);
}

/**
 * Generate key for note deduplication
 */
export function getNoteDedupeKey(note: any): string {
  // For notes, use filename as source_file, 0 as line_number (no line in notes), and title as text
  return note.filename;
}

/**
 * Deduplicate an array of items using a key generator function
 */
export function deduplicate<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    const key = keyFn(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }

  return result;
}
