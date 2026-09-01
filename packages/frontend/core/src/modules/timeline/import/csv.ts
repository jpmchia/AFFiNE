/**
 * CSV/TSV bulk-import parser for the AFFiNE timeline.
 *
 * Expected format:
 * ```
 * StartDateTime,EndDateTime,Duration,Category,Tags,Title,Content,Colour
 * 27/07/2026 13:50,28/07/2026 01:53,,Sex,ZoomBF;Blockhead;TallDrinks,12 hour session,12 hour session with ZBF and 2 others,#F5A623
 * ```
 *
 * - Required: `StartDateTime`.
 * - Optional: `EndDateTime`, `Duration`, `Category`, `Tags`, `Title`, `Content`, `Colour`.
 * - Dates are `dd/mm/yyyy` (optionally with `hh:mm` or `hh:mm:ss`).
 * - `Duration` is `hh:mm:ss` or `mm:ss` and is only used when `EndDateTime` is empty.
 * - `Title` and `Content` are combined into the note text; at least one must be provided.
 * - `Colour` is applied to the tags and category of the row (first colour wins per tag/category).
 * - Delimiter can be a comma or a tab; it is auto-detected from the header row.
 * - Quoted fields ("...") are respected and doubled quotes are unescaped.
 * - Multi-line quoted fields are supported.
 */

import type {
  TimelineImportDataset,
  TimelineImportEntry,
  TimelineImportLabelDef,
  TimelineImportParseResult,
} from './schema';

function detectDelimiter(headerLine: string): string {
  const tabs = (headerLine.match(/\t/g) ?? []).length;
  const commas = (headerLine.match(/,/g) ?? []).length;
  if (tabs === 0 && commas === 0) return ',';
  return tabs > commas ? '\t' : ',';
}

function parseCSV(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = '';
  let inQuote = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (c === '"') {
      if (inQuote && next === '"') {
        current += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
      continue;
    }

    if (c === delimiter && !inQuote) {
      row.push(current.trim());
      current = '';
      continue;
    }

    if ((c === '\r' || c === '\n') && !inQuote) {
      if (c === '\r' && next === '\n') {
        i++;
      }
      row.push(current.trim());
      rows.push(row);
      row = [];
      current = '';
      continue;
    }

    current += c;
  }

  if (current.length || row.length) {
    row.push(current.trim());
    rows.push(row);
  }

  return rows;
}

function parseDateTime(value: string): number | null {
  const s = value.trim();
  if (!s) return null;

  const match = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const hour = match[4] ? Number(match[4]) : 0;
  const minute = match[5] ? Number(match[5]) : 0;
  const second = match[6] ? Number(match[6]) : 0;

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;

  const parsed = new Date(year, month - 1, day, hour, minute, second);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed.getTime();
}

function parseDuration(value: string): number | null {
  const s = value.trim();
  if (!s) return null;

  const hms = s.match(/^(\d+):(\d{1,2}):(\d{1,2})$/);
  if (hms) {
    const hours = Number(hms[1]);
    const minutes = Number(hms[2]);
    const seconds = Number(hms[3]);
    if (minutes > 59 || seconds > 59) return null;
    return (hours * 3600 + minutes * 60 + seconds) * 1000;
  }

  const ms = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (ms) {
    const minutes = Number(ms[1]);
    const seconds = Number(ms[2]);
    if (seconds > 59) return null;
    return (minutes * 60 + seconds) * 1000;
  }

  return null;
}

function nextHeaderIndex(
  current: number | undefined,
  headerMap: Map<string, number>
): number | undefined {
  if (current === undefined) return undefined;
  const others = [...headerMap.values()].filter(v => v > current);
  others.sort((a, b) => a - b);
  return others[0];
}

export function parseTimelineCSV(text: string): TimelineImportParseResult {
  if (!text.trim()) {
    return { errors: ['CSV file is empty'] };
  }

  const firstNewline = text.search(/\r?\n/);
  const headerLine = firstNewline === -1 ? text : text.slice(0, firstNewline);
  const delimiter = detectDelimiter(headerLine);

  const rows = parseCSV(text, delimiter);
  if (rows.length < 1) {
    return { errors: ['CSV file has no header row'] };
  }

  const rawHeader = rows[0].map(h => h.toLowerCase());
  const headerMap = new Map<string, number>();
  rawHeader.forEach((name, index) => {
    if (name) headerMap.set(name, index);
  });

  const startIndex = headerMap.get('startdatetime');

  if (startIndex === undefined) {
    return { errors: ['Header must include a "StartDateTime" column'] };
  }

  const endIndex = headerMap.get('enddatetime');
  const durationIndex = headerMap.get('duration');
  const categoryIndex = headerMap.get('category');
  const tagsIndex = headerMap.get('tags');
  const titleIndex = headerMap.get('title');
  const contentIndex = headerMap.get('content');
  const colourIndex = headerMap.get('colour');

  const errors: string[] = [];
  const tagColours = new Map<string, string>();
  const categoryColours = new Map<string, string>();
  const entries: TimelineImportEntry[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 1;

    if (row.every(field => field.trim() === '')) {
      continue;
    }

    const rawStart = row[startIndex] ?? '';
    const displayAt = parseDateTime(rawStart);

    if (displayAt === null) {
      errors.push(
        `Row ${rowNumber}: "StartDateTime" is not a valid dd/mm/yyyy[ hh:mm[:ss]] value`
      );
      continue;
    }

    let endAt: number | undefined;
    let endTimeSet = false;
    if (endIndex !== undefined) {
      const rawEnd = row[endIndex]?.trim() ?? '';
      if (rawEnd) {
        const parsedEnd = parseDateTime(rawEnd);
        if (parsedEnd === null) {
          errors.push(
            `Row ${rowNumber}: "EndDateTime" is not a valid dd/mm/yyyy[ hh:mm[:ss]] value`
          );
          continue;
        }
        if (parsedEnd < displayAt) {
          errors.push(
            `Row ${rowNumber}: "EndDateTime" (${rawEnd}) must be later than "StartDateTime" (${rawStart})`
          );
          continue;
        }
        if (parsedEnd > displayAt) {
          endAt = parsedEnd;
        }
        endTimeSet = true;
      }
    }

    if (!endTimeSet && durationIndex !== undefined) {
      const rawDuration = (row[durationIndex] ?? '').trim();
      if (rawDuration) {
        const durationMs = parseDuration(rawDuration);
        if (durationMs === null) {
          errors.push(
            `Row ${rowNumber}: "Duration" is not a valid hh:mm:ss or mm:ss value`
          );
          continue;
        }
        endAt = displayAt + durationMs;
      }
    }

    const category =
      categoryIndex !== undefined
        ? (row[categoryIndex] ?? '').trim() || undefined
        : undefined;

    const tags =
      tagsIndex !== undefined
        ? (row[tagsIndex] ?? '')
            .split(',')
            .map(t => t.trim())
            .filter(Boolean)
        : undefined;

    const titleNext = nextHeaderIndex(titleIndex, headerMap);
    const title =
      titleIndex !== undefined
        ? row.slice(titleIndex, titleNext).join(delimiter).trim() || undefined
        : undefined;

    const contentNext = nextHeaderIndex(contentIndex, headerMap);
    const content =
      contentIndex !== undefined
        ? row.slice(contentIndex, contentNext).join(delimiter).trim() ||
          undefined
        : undefined;

    let text: string | undefined;
    if (title && content) {
      text = `${title}\n${content}`;
    } else if (title) {
      text = title;
    } else if (content) {
      text = content;
    }

    if (!text) {
      errors.push(
        `Row ${rowNumber}: "Title" and/or "Content" cannot both be empty`
      );
      continue;
    }

    const colour =
      colourIndex !== undefined
        ? (row[colourIndex] ?? '').trim() || undefined
        : undefined;

    if (colour) {
      if (tags) {
        for (const tag of tags) {
          if (!tagColours.has(tag)) {
            tagColours.set(tag, colour);
          }
        }
      }
      if (category && !categoryColours.has(category)) {
        categoryColours.set(category, colour);
      }
    }

    entries.push({
      displayAt,
      endAt,
      text,
      title,
      category,
      tags,
      color: colour,
    });
  }

  if (entries.length === 0 && errors.length === 0) {
    errors.push('No importable rows found in CSV');
  }

  if (errors.length > 0) {
    return { errors };
  }

  const tagDefs: TimelineImportLabelDef[] = [];
  for (const [name, color] of tagColours) {
    tagDefs.push({ name, color });
  }
  const categoryDefs: TimelineImportLabelDef[] = [];
  for (const [name, color] of categoryColours) {
    categoryDefs.push({ name, color });
  }

  const dataset: TimelineImportDataset = {
    version: 1,
    entries,
    tags: tagDefs.length > 0 ? tagDefs : undefined,
    categories: categoryDefs.length > 0 ? categoryDefs : undefined,
  };

  return { dataset, errors: [] };
}
