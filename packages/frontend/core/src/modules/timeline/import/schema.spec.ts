import { describe, expect, test } from 'vitest';

import { parseTimelineDataset, resolveMediaFile } from './schema';

describe('parseTimelineDataset', () => {
  test('accepts a minimal valid dataset', () => {
    const { dataset, errors } = parseTimelineDataset({
      version: 1,
      entries: [{ displayAt: 1700000000000, text: 'hello' }],
    });
    expect(errors).toEqual([]);
    expect(dataset?.entries).toHaveLength(1);
    expect(dataset?.entries[0].displayAt).toBe(1700000000000);
  });

  test('parses ISO date strings into epoch ms', () => {
    const { dataset } = parseTimelineDataset({
      version: 1,
      entries: [{ displayAt: '2026-07-12T09:30:00Z', text: 'x' }],
    });
    expect(dataset?.entries[0].displayAt).toBe(
      Date.parse('2026-07-12T09:30:00Z')
    );
  });

  test('rejects non-object input', () => {
    expect(parseTimelineDataset(null).errors).not.toHaveLength(0);
    expect(parseTimelineDataset([]).errors).not.toHaveLength(0);
    expect(parseTimelineDataset('x').errors).not.toHaveLength(0);
  });

  test('rejects wrong version and empty entries', () => {
    expect(
      parseTimelineDataset({ version: 2, entries: [{}] }).errors
    ).toContain('"version" must be 1');
    expect(parseTimelineDataset({ version: 1, entries: [] }).errors).toContain(
      '"entries" must be a non-empty array'
    );
  });

  test('rejects entries without text or media', () => {
    const { errors } = parseTimelineDataset({
      version: 1,
      entries: [{ displayAt: 1 }],
    });
    expect(errors[0]).toMatch(/must have "text" and\/or "media"/);
  });

  test('rejects invalid displayAt', () => {
    const { errors } = parseTimelineDataset({
      version: 1,
      entries: [{ displayAt: 'not a date', text: 'x' }],
    });
    expect(errors[0]).toMatch(/displayAt/);
  });

  test('normalizes tag and category label definitions', () => {
    const { dataset, errors } = parseTimelineDataset({
      version: 1,
      tags: ['work', { name: 'health', color: '#123456' }],
      categories: [{ name: 'Meetings' }],
      entries: [
        {
          displayAt: 1,
          text: 'x',
          tags: [' work '],
          category: 'Meetings',
        },
      ],
    });
    expect(errors).toEqual([]);
    expect(dataset?.tags).toEqual([
      { name: 'work', color: undefined },
      { name: 'health', color: '#123456' },
    ]);
    expect(dataset?.categories).toEqual([
      { name: 'Meetings', color: undefined },
    ]);
    expect(dataset?.entries[0].tags).toEqual(['work']);
    expect(dataset?.entries[0].category).toBe('Meetings');
  });

  test('collects multiple errors at once', () => {
    const { errors } = parseTimelineDataset({
      version: 1,
      entries: [
        { displayAt: 'bad', text: 'x' },
        { displayAt: 1 },
        { displayAt: 2, text: 'ok' },
      ],
    });
    expect(errors).toHaveLength(2);
  });

  test('media-only entries are valid', () => {
    const { dataset, errors } = parseTimelineDataset({
      version: 1,
      entries: [{ displayAt: 1, media: 'photos/a.jpg' }],
    });
    expect(errors).toEqual([]);
    expect(dataset?.entries[0].media).toBe('photos/a.jpg');
  });
});

describe('resolveMediaFile', () => {
  const files = new Map([
    ['photos/a.jpg', 'file-a'],
    ['b.png', 'file-b'],
  ]);

  test('matches by exact key', () => {
    expect(resolveMediaFile('photos/a.jpg', files)).toBe('file-a');
  });

  test('falls back to base-name match', () => {
    expect(resolveMediaFile('some/other/path/a.jpg', files)).toBe('file-a');
    expect(resolveMediaFile('b.png', files)).toBe('file-b');
  });

  test('returns undefined when nothing matches', () => {
    expect(resolveMediaFile('missing.gif', files)).toBeUndefined();
  });
});
