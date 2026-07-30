import { describe, expect, test } from 'vitest';

import type { TimelineEntry } from '../../../../../modules/timeline';
import { applyMerges } from './merge';

function entry(overrides: Partial<TimelineEntry>): TimelineEntry {
  return {
    docId: 'doc-1',
    docTitle: 'Doc',
    blockId: `block-${Math.random()}`,
    flavour: 'affine:paragraph',
    displayInTimelineAt: 0,
    excerpt: '',
    preview: { kind: 'text', text: '' },
    ...overrides,
  };
}

describe('applyMerges', () => {
  const a = entry({ docId: 'd', blockId: 'a', displayInTimelineAt: 100 });
  const b = entry({ docId: 'd', blockId: 'b', displayInTimelineAt: 300 });
  const c = entry({ docId: 'd', blockId: 'c', displayInTimelineAt: 200 });

  test('passes entries through when there are no merges', () => {
    expect(applyMerges([a, b], undefined)).toEqual([a, b]);
    expect(applyMerges([a, b], [])).toEqual([a, b]);
  });

  test('collapses a merge set into a single entry keyed by the earliest member', () => {
    const result = applyMerges(
      [a, b, c],
      [{ id: 'm1', entryKeys: ['d:b', 'd:c'] }]
    );
    expect(result).toHaveLength(2);
    const merged = result.find(e => e.mergeId === 'm1');
    // representative is c (t=200, earlier than b at t=300)
    expect(merged?.blockId).toBe('c');
    expect(merged?.mergedEntries?.map(e => e.blockId)).toEqual(['c', 'b']);
    expect(result.find(e => e.blockId === 'a')).toBeDefined();
    expect(result.find(e => e.blockId === 'b' && !e.mergeId)).toBeUndefined();
  });

  test('ignores merge sets with fewer than two present entries', () => {
    const result = applyMerges(
      [a, b],
      [{ id: 'm1', entryKeys: ['d:a', 'd:missing'] }]
    );
    expect(result).toHaveLength(2);
    expect(result.every(e => !e.mergeId)).toBe(true);
  });

  test('supports multiple independent merge sets', () => {
    const d = entry({ docId: 'd', blockId: 'x', displayInTimelineAt: 400 });
    const e2 = entry({ docId: 'd', blockId: 'y', displayInTimelineAt: 500 });
    const result = applyMerges(
      [a, b, d, e2],
      [
        { id: 'm1', entryKeys: ['d:a', 'd:b'] },
        { id: 'm2', entryKeys: ['d:x', 'd:y'] },
      ]
    );
    expect(result).toHaveLength(2);
    expect(
      result
        .map(e => e.mergeId)
        .sort((x, y) => (x ?? '').localeCompare(y ?? ''))
    ).toEqual(['m1', 'm2']);
  });
});
