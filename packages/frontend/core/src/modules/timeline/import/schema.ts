/**
 * Timeline bulk-import dataset schema and validation.
 *
 * This module is intentionally free of AFFiNE framework dependencies so the
 * same parsing/validation can be reused by a headless CLI importer.
 *
 * Dataset format (JSON):
 * ```jsonc
 * {
 *   "version": 1,
 *   "docTitle": "Imported dataset",       // optional, target doc title
 *   "tags": [                              // optional tag definitions
 *     { "name": "work", "color": "#F5A623" }
 *   ],
 *   "categories": [{ "name": "Meetings" }],
 *   "entries": [
 *     {
 *       "displayAt": "2026-07-12T09:30:00Z", // ISO string or epoch ms
 *       "text": "Did the thing",             // paragraph content
 *       "media": "photos/img1.jpg",          // optional media file reference
 *       "tags": ["work"],                    // tag names
 *       "category": "Meetings"               // single category name
 *     }
 *   ]
 * }
 * ```
 * Each entry must have `text` and/or `media`.
 */

export interface TimelineImportLabelDef {
  name: string;
  color?: string;
}

export interface TimelineImportEntry {
  /** Normalized to epoch milliseconds. */
  displayAt: number;
  text?: string;
  /** Path or file name referencing a media file shipped with the dataset. */
  media?: string;
  /** Tag names (resolved or created at import time). */
  tags?: string[];
  /** Category name (resolved or created at import time). */
  category?: string;
}

export interface TimelineImportDataset {
  version: 1;
  docTitle?: string;
  tags?: TimelineImportLabelDef[];
  categories?: TimelineImportLabelDef[];
  entries: TimelineImportEntry[];
}

export interface TimelineImportParseResult {
  dataset?: TimelineImportDataset;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDisplayAt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    if (!Number.isNaN(ms)) return ms;
  }
  return null;
}

function parseLabelDefs(
  value: unknown,
  field: string,
  errors: string[]
): TimelineImportLabelDef[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    errors.push(`"${field}" must be an array`);
    return undefined;
  }
  const defs: TimelineImportLabelDef[] = [];
  value.forEach((item, i) => {
    if (typeof item === 'string') {
      if (item.trim()) defs.push({ name: item.trim() });
      return;
    }
    if (!isRecord(item) || typeof item.name !== 'string' || !item.name.trim()) {
      errors.push(`"${field}[${i}]" must be a name string or { name, color? }`);
      return;
    }
    defs.push({
      name: item.name.trim(),
      color: typeof item.color === 'string' ? item.color : undefined,
    });
  });
  return defs;
}

/**
 * Validates and normalizes a parsed JSON value into a
 * {@link TimelineImportDataset}. Returns errors instead of throwing so a UI
 * or CLI can present all problems at once.
 */
export function parseTimelineDataset(
  input: unknown
): TimelineImportParseResult {
  const errors: string[] = [];

  if (!isRecord(input)) {
    return { errors: ['Dataset must be a JSON object'] };
  }
  if (input.version !== 1) {
    errors.push('"version" must be 1');
  }
  if (
    input.docTitle !== undefined &&
    (typeof input.docTitle !== 'string' || !input.docTitle.trim())
  ) {
    errors.push('"docTitle" must be a non-empty string');
  }

  const tags = parseLabelDefs(input.tags, 'tags', errors);
  const categories = parseLabelDefs(input.categories, 'categories', errors);

  if (!Array.isArray(input.entries) || input.entries.length === 0) {
    errors.push('"entries" must be a non-empty array');
    return { errors };
  }

  const entries: TimelineImportEntry[] = [];
  input.entries.forEach((raw, i) => {
    if (!isRecord(raw)) {
      errors.push(`"entries[${i}]" must be an object`);
      return;
    }
    const displayAt = parseDisplayAt(raw.displayAt);
    if (displayAt === null) {
      errors.push(
        `"entries[${i}].displayAt" must be an ISO date string or epoch ms`
      );
      return;
    }
    const text =
      typeof raw.text === 'string' && raw.text.trim() ? raw.text : undefined;
    const media =
      typeof raw.media === 'string' && raw.media.trim()
        ? raw.media.trim()
        : undefined;
    if (!text && !media) {
      errors.push(`"entries[${i}]" must have "text" and/or "media"`);
      return;
    }
    let entryTags: string[] | undefined;
    if (raw.tags !== undefined) {
      if (
        !Array.isArray(raw.tags) ||
        raw.tags.some(t => typeof t !== 'string')
      ) {
        errors.push(`"entries[${i}].tags" must be an array of strings`);
        return;
      }
      entryTags = (raw.tags as string[])
        .map(t => t.trim())
        .filter(t => t.length > 0);
    }
    let category: string | undefined;
    if (raw.category !== undefined) {
      if (typeof raw.category !== 'string' || !raw.category.trim()) {
        errors.push(`"entries[${i}].category" must be a non-empty string`);
        return;
      }
      category = raw.category.trim();
    }
    entries.push({ displayAt, text, media, tags: entryTags, category });
  });

  if (errors.length > 0) {
    return { errors };
  }

  return {
    dataset: {
      version: 1,
      docTitle:
        typeof input.docTitle === 'string' ? input.docTitle.trim() : undefined,
      tags,
      categories,
      entries,
    },
    errors,
  };
}

/**
 * Resolves an entry's `media` reference against the provided files. Tries an
 * exact key match first (relative path), then falls back to matching by file
 * base name.
 */
export function resolveMediaFile<T>(
  media: string,
  files: Map<string, T>
): T | undefined {
  const exact = files.get(media);
  if (exact) return exact;
  const baseName = media.split('/').pop() ?? media;
  for (const [key, file] of files) {
    if ((key.split('/').pop() ?? key) === baseName) return file;
  }
  return undefined;
}
