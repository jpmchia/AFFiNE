import type {
  TimelineEntry,
  TimelineEntrySet,
} from '../../../../../modules/timeline';
import { entryKey } from './layout';

/**
 * A timeline entry that may represent several merged source entries. The
 * representative (earliest) entry provides the identity/key used by the
 * layout; `mergedEntries` carries every member for rendering, and `mergeId`
 * links back to the merge definition for unmerging.
 */
export interface MergedTimelineEntry extends TimelineEntry {
  mergeId?: string;
  mergedEntries?: TimelineEntry[];
}

/**
 * Collapses each merge set into a single synthetic entry, keyed by its
 * earliest member. Merge sets with fewer than two present entries are
 * ignored (their entries pass through unchanged).
 */
export function applyMerges(
  entries: TimelineEntry[],
  merges: TimelineEntrySet[] | undefined
): MergedTimelineEntry[] {
  if (!merges || merges.length === 0) return entries;

  const byKey = new Map(entries.map(entry => [entryKey(entry), entry]));
  const consumed = new Set<string>();
  const mergedResults: MergedTimelineEntry[] = [];

  for (const merge of merges) {
    const members = merge.entryKeys
      .map(key => byKey.get(key))
      .filter((entry): entry is TimelineEntry => !!entry)
      .sort((a, b) => a.displayInTimelineAt - b.displayInTimelineAt);
    if (members.length < 2) continue;
    for (const member of members) {
      consumed.add(entryKey(member));
    }
    const representative = members[0];
    mergedResults.push({
      ...representative,
      mergeId: merge.id,
      mergedEntries: members,
    });
  }

  if (consumed.size === 0) return entries;

  const result: MergedTimelineEntry[] = entries.filter(
    entry => !consumed.has(entryKey(entry))
  );
  return [...result, ...mergedResults];
}
