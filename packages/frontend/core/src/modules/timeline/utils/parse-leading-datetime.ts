/**
 * Parses a date and/or time from the beginning of a block's text content,
 * e.g. chat exports like `[13/05/2024, 21:03:11] message` or `21:03 - note`.
 */

export interface ParsedLeadingDateTime {
  /** Resolved timestamp in ms. */
  timestamp: number;
  /**
   * The exact leading text that was parsed (including brackets and trailing
   * separators), to be hidden from the content view.
   */
  matchedText: string;
}

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

// time: 21:03, 21:03:11, 9:03 pm
const TIME_RE = /(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s?([AaPp])\.?[Mm]\.?)?/su;
// numeric date: 13/05/2024, 13-05-24, 13.05.2024
const DATE_NUM_RE = /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/su;
// ISO date: 2024-05-13
const DATE_ISO_RE = /(\d{4})-(\d{2})-(\d{2})/su;
// month-name date: 13-May-24, 13 May 2024, 13/May/2024
const DATE_MMM_RE = /(\d{1,2})[\s\-/.]([A-Za-z]{3,9})[\s\-/.,]+(\d{2,4})/su;

// separators between a date part and a time part
const PART_SEP = String.raw`(?:,\s*|\s+(?:at\s+)?|\s*[-–—]\s*)`;
// what may follow the parsed prefix: separators swallowed into the match
const TRAILING = String.raw`[\])]?[\s\-–—:,.]*`;

interface DatePart {
  year: number;
  month: number;
  day: number;
}
interface TimePart {
  hour: number;
  minute: number;
  second: number;
}

function normalizeYear(raw: string): number {
  const year = parseInt(raw, 10);
  if (raw.length >= 4) return year;
  return year < 70 ? 2000 + year : 1900 + year;
}

function validDate(part: DatePart): boolean {
  return part.month >= 0 && part.month <= 11 && part.day >= 1 && part.day <= 31;
}

function parseNumericDate(m: RegExpMatchArray): DatePart {
  // day-first convention (dd/MM/yyyy)
  let day = parseInt(m[1], 10);
  let month = parseInt(m[2], 10) - 1;
  // fall back to MM/dd if day-first is impossible (e.g. 05/13/2024)
  if (day > 31 || (month > 11 && day <= 12)) {
    [day, month] = [parseInt(m[2], 10), parseInt(m[1], 10) - 1];
  }
  return { year: normalizeYear(m[3]), month, day };
}

function parseIsoDate(m: RegExpMatchArray): DatePart {
  return {
    year: parseInt(m[1], 10),
    month: parseInt(m[2], 10) - 1,
    day: parseInt(m[3], 10),
  };
}

function parseMonthNameDate(m: RegExpMatchArray): DatePart | null {
  const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
  if (month === undefined) return null;
  return { year: normalizeYear(m[3]), month, day: parseInt(m[1], 10) };
}

function parseTime(m: RegExpMatchArray): TimePart | null {
  let hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  const second = m[3] ? parseInt(m[3], 10) : 0;
  const meridiem = m[4]?.toLowerCase();
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === 'p' && hour !== 12) hour += 12;
    if (meridiem === 'a' && hour === 12) hour = 0;
  }
  if (hour > 23 || minute > 59 || second > 59) return null;
  return { hour, minute, second };
}

function anchored(...parts: string[]): RegExp {
  return new RegExp(String.raw`^\s*[[(]?` + parts.join('') + TRAILING, 'su');
}

interface Candidate {
  re: RegExp;
  /** group offsets: [dateGroups, timeGroups] in match order */
  kind: 'date-time' | 'time-date' | 'date' | 'time';
  dateRe?: RegExp;
}

function buildCandidates(): Candidate[] {
  const time = TIME_RE.source;
  const dates: { re: RegExp; src: string }[] = [
    { re: DATE_ISO_RE, src: DATE_ISO_RE.source },
    { re: DATE_MMM_RE, src: DATE_MMM_RE.source },
    { re: DATE_NUM_RE, src: DATE_NUM_RE.source },
  ];
  const candidates: Candidate[] = [];
  for (const d of dates) {
    candidates.push({
      re: anchored(d.src, PART_SEP, time),
      kind: 'date-time',
      dateRe: d.re,
    });
    candidates.push({
      re: anchored(time, PART_SEP, d.src),
      kind: 'time-date',
      dateRe: d.re,
    });
  }
  for (const d of dates) {
    candidates.push({ re: anchored(d.src), kind: 'date', dateRe: d.re });
  }
  candidates.push({ re: anchored(time), kind: 'time' });
  return candidates;
}

const CANDIDATES = buildCandidates();

function toDatePart(
  kind: Candidate['dateRe'],
  m: RegExpMatchArray
): DatePart | null {
  if (kind === DATE_ISO_RE) return parseIsoDate(m);
  if (kind === DATE_MMM_RE) return parseMonthNameDate(m);
  return parseNumericDate(m);
}

/**
 * Attempts to parse a leading date/time prefix from `text`.
 *
 * @param referenceTime used to fill in the date when only a time is present
 * @returns the resolved timestamp and the matched prefix, or null
 */
export function parseLeadingDateTime(
  text: string,
  referenceTime: number
): ParsedLeadingDateTime | null {
  for (const candidate of CANDIDATES) {
    const match = text.match(candidate.re);
    if (!match) continue;

    const groups = match.slice(1);
    let datePart: DatePart | null = null;
    let timePart: TimePart | null = null;

    if (candidate.kind === 'date-time') {
      const dateGroups = groups.slice(0, 3);
      const timeGroups = groups.slice(3, 7);
      datePart = toDatePart(candidate.dateRe, [
        match[0],
        ...dateGroups,
      ] as RegExpMatchArray);
      timePart = parseTime([match[0], ...timeGroups] as RegExpMatchArray);
      if (!timePart) continue;
    } else if (candidate.kind === 'time-date') {
      const timeGroups = groups.slice(0, 4);
      const dateGroups = groups.slice(4, 7);
      timePart = parseTime([match[0], ...timeGroups] as RegExpMatchArray);
      datePart = toDatePart(candidate.dateRe, [
        match[0],
        ...dateGroups,
      ] as RegExpMatchArray);
      if (!timePart) continue;
    } else if (candidate.kind === 'date') {
      datePart = toDatePart(candidate.dateRe, match);
    } else {
      timePart = parseTime(match);
      if (!timePart) continue;
    }

    if (datePart && !validDate(datePart)) continue;

    let base: Date;
    if (datePart) {
      base = new Date(
        datePart.year,
        datePart.month,
        datePart.day,
        timePart?.hour ?? 0,
        timePart?.minute ?? 0,
        timePart?.second ?? 0
      );
      // reject impossible dates that rolled over (e.g. 31/02)
      if (base.getDate() !== datePart.day) continue;
    } else if (timePart) {
      base = new Date(referenceTime);
      base.setHours(timePart.hour, timePart.minute, timePart.second, 0);
    } else {
      continue;
    }

    return { timestamp: base.getTime(), matchedText: match[0] };
  }
  return null;
}

/**
 * Strips a previously parsed prefix from content text for display.
 */
export function stripParsedPrefix(text: string, prefix?: string): string {
  if (prefix && text.startsWith(prefix)) {
    return text.slice(prefix.length);
  }
  return text;
}

/**
 * Strips several previously parsed prefixes (e.g. a date/time prefix and a
 * tag prefix) from content text, in whatever order they appear.
 */
export function stripParsedPrefixes(
  text: string,
  prefixes: (string | undefined)[]
): string {
  const pending = prefixes.filter((p): p is string => !!p);
  let result = text;
  let changed = true;
  while (changed && pending.length > 0) {
    changed = false;
    for (let i = 0; i < pending.length; i++) {
      if (result.startsWith(pending[i])) {
        result = result.slice(pending[i].length);
        pending.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return result;
}
