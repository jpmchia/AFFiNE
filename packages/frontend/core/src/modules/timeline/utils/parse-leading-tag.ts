/**
 * Parses a predefined tag name from the beginning of a block's text content,
 * e.g. `work: pick up laptop` or `#errands - buy milk`.
 */

export interface ParsedLeadingTag {
  /** The id of the matched predefined tag. */
  tagId: string;
  /**
   * The exact leading text that was matched (including any `#`/brackets and
   * trailing separators), to be hidden from the content view.
   */
  matchedText: string;
}

/** optional opener before the tag name: whitespace, `#`, `[` or `(` */
const OPENER_RE = /^\s*[#[(]?\s*/su;
/** what must follow the tag name: closer and/or separators (or end of text) */
const TRAILING_RE = /^[\])]?[\s\-–—:,.;|]*/su;

/**
 * Attempts to match one of the predefined `tags` at the start of `text`.
 * Matching is case-insensitive and requires the tag name to be followed by
 * a separator (or the end of the text), so `work` never matches `workout`.
 * Longer tag names win over shorter ones.
 */
export function parseLeadingTag(
  text: string,
  tags: { id: string; name: string }[]
): ParsedLeadingTag | null {
  const opener = text.match(OPENER_RE);
  const start = opener?.[0].length ?? 0;
  const rest = text.slice(start);
  const restLower = rest.toLowerCase();

  const sorted = tags
    .filter(tag => tag.name.trim().length > 0)
    .sort((a, b) => b.name.length - a.name.length);

  for (const tag of sorted) {
    const name = tag.name.toLowerCase();
    if (!restLower.startsWith(name)) continue;
    const after = rest.slice(name.length);
    const trailing = after.match(TRAILING_RE)?.[0] ?? '';
    // require a separator between the tag and the following content
    if (after.length > 0 && trailing.length === 0) continue;
    return {
      tagId: tag.id,
      matchedText: text.slice(0, start + name.length + trailing.length),
    };
  }
  return null;
}
