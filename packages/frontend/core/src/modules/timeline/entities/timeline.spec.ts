import { Framework, LiveData } from '@toeverything/infra';
import { of } from 'rxjs';
import { describe, expect, test } from 'vitest';

import { TimelineSettingStore } from '../store/setting';
import { TimelineStore } from '../store/timeline';
import type { TimelineEntry } from '../type';
import { TimelineSetting } from './setting';
import { Timeline } from './timeline';

function entry(overrides: Partial<TimelineEntry>): TimelineEntry {
  return {
    docId: 'doc-1',
    docTitle: 'Doc',
    blockId: 'block-1',
    flavour: 'affine:paragraph',
    displayInTimelineAt: 0,
    excerpt: '',
    preview: { kind: 'text', text: '' },
    ...overrides,
  };
}

type Settings = {
  grouping?: 'day' | 'week' | 'month';
  sortDesc?: boolean;
  hiddenEntries?: string[];
  initialLoadMonths?: number;
};

function createTimeline(entries: TimelineEntry[], settings: Settings = {}) {
  // most tests use fixed historic timestamps; disable the initial-load
  // window unless a test opts in
  const effective: Settings = { initialLoadMonths: 0, ...settings };
  const framework = new Framework();
  const fakeStore = {
    watchEntries: () => of(entries),
  };
  const fakeSettingStore = {
    watchIsLoading: () => of(false),
    watchSetting: () => of(effective),
    watchSettingKey: (key: keyof Settings) => new LiveData(effective[key]),
    getSettingKey: (key: keyof Settings) => effective[key],
    updateSetting: () => {},
  };
  framework
    .store(
      TimelineSettingStore,
      fakeSettingStore as unknown as TimelineSettingStore
    )
    .store(TimelineStore, fakeStore as unknown as TimelineStore)
    .entity(TimelineSetting, [TimelineSettingStore])
    .entity(Timeline, [TimelineStore, TimelineSetting]);
  return framework.provider().createEntity(Timeline);
}

describe('Timeline entity', () => {
  test('sortedEntries$ sorts entries newest-first by default', () => {
    const timeline = createTimeline([
      entry({ blockId: 'a', displayInTimelineAt: 100 }),
      entry({ blockId: 'b', displayInTimelineAt: 300 }),
      entry({ blockId: 'c', displayInTimelineAt: 200 }),
    ]);
    expect(timeline.sortedEntries$.value.map(e => e.blockId)).toEqual([
      'b',
      'c',
      'a',
    ]);
  });

  test('sortedEntries$ sorts oldest-first when sortDesc is false', () => {
    const timeline = createTimeline(
      [
        entry({ blockId: 'a', displayInTimelineAt: 100 }),
        entry({ blockId: 'b', displayInTimelineAt: 300 }),
        entry({ blockId: 'c', displayInTimelineAt: 200 }),
      ],
      { sortDesc: false }
    );
    expect(timeline.sortedEntries$.value.map(e => e.blockId)).toEqual([
      'a',
      'c',
      'b',
    ]);
  });

  test('groupedEntries$ buckets entries by day by default', () => {
    const day1 = Date.UTC(2024, 0, 1, 10);
    const day2 = Date.UTC(2024, 0, 2, 10);
    const timeline = createTimeline([
      entry({ blockId: 'a', displayInTimelineAt: day1 }),
      entry({ blockId: 'b', displayInTimelineAt: day2 }),
      entry({ blockId: 'c', displayInTimelineAt: day1 + 1000 }),
    ]);
    const groups = timeline.groupedEntries$.value;
    const groupMap = new Map(groups);
    expect(groups).toHaveLength(2);
    expect(
      groupMap
        .get('2024-01-01')
        ?.map(e => e.blockId)
        .sort()
    ).toEqual(['a', 'c']);
    expect(groupMap.get('2024-01-02')?.map(e => e.blockId)).toEqual(['b']);
  });

  test('groupedEntries$ buckets entries by month when configured', () => {
    const jan = Date.UTC(2024, 0, 15);
    const feb = Date.UTC(2024, 1, 3);
    const timeline = createTimeline(
      [
        entry({ blockId: 'a', displayInTimelineAt: jan }),
        entry({ blockId: 'b', displayInTimelineAt: feb }),
      ],
      { grouping: 'month' }
    );
    const groupMap = new Map(timeline.groupedEntries$.value);
    expect(groupMap.has('2024-01')).toBe(true);
    expect(groupMap.has('2024-02')).toBe(true);
  });

  test('entries$ filters out hidden entries', () => {
    const timeline = createTimeline(
      [
        entry({ docId: 'doc-1', blockId: 'a', displayInTimelineAt: 100 }),
        entry({ docId: 'doc-1', blockId: 'b', displayInTimelineAt: 200 }),
        entry({ docId: 'doc-2', blockId: 'a', displayInTimelineAt: 300 }),
      ],
      { hiddenEntries: ['doc-1:b'] }
    );
    expect(timeline.entries$.value.map(e => `${e.docId}:${e.blockId}`)).toEqual(
      ['doc-1:a', 'doc-2:a']
    );
  });

  test('entries$ returns all entries when nothing is hidden', () => {
    const timeline = createTimeline([
      entry({ blockId: 'a', displayInTimelineAt: 100 }),
      entry({ blockId: 'b', displayInTimelineAt: 200 }),
    ]);
    expect(timeline.entries$.value).toHaveLength(2);
  });

  test('initial-load window hides entries older than the configured months', () => {
    const now = Date.now();
    const monthMs = 30 * 24 * 60 * 60 * 1000;
    const timeline = createTimeline(
      [
        entry({ blockId: 'recent', displayInTimelineAt: now - monthMs }),
        entry({ blockId: 'old', displayInTimelineAt: now - 6 * monthMs }),
      ],
      { initialLoadMonths: 3 }
    );
    expect(timeline.entries$.value.map(e => e.blockId)).toEqual(['recent']);
    expect(timeline.olderCount$.value).toBe(1);
  });

  test('loadOlder extends the window by another period', () => {
    const now = Date.now();
    const monthMs = 30 * 24 * 60 * 60 * 1000;
    const timeline = createTimeline(
      [
        entry({ blockId: 'recent', displayInTimelineAt: now - monthMs }),
        entry({ blockId: 'old', displayInTimelineAt: now - 5 * monthMs }),
        entry({ blockId: 'ancient', displayInTimelineAt: now - 24 * monthMs }),
      ],
      { initialLoadMonths: 3 }
    );
    expect(timeline.entries$.value).toHaveLength(1);
    timeline.loadOlder();
    expect(timeline.entries$.value.map(e => e.blockId).sort()).toEqual([
      'old',
      'recent',
    ]);
    expect(timeline.olderCount$.value).toBe(1);
  });

  test('loadAll removes the window entirely', () => {
    const now = Date.now();
    const monthMs = 30 * 24 * 60 * 60 * 1000;
    const timeline = createTimeline(
      [
        entry({ blockId: 'recent', displayInTimelineAt: now - monthMs }),
        entry({ blockId: 'ancient', displayInTimelineAt: now - 24 * monthMs }),
      ],
      { initialLoadMonths: 3 }
    );
    timeline.loadAll();
    expect(timeline.entries$.value).toHaveLength(2);
    expect(timeline.olderCount$.value).toBe(0);
  });

  test('window is disabled when initialLoadMonths is 0', () => {
    const timeline = createTimeline(
      [entry({ blockId: 'ancient', displayInTimelineAt: 100 })],
      { initialLoadMonths: 0 }
    );
    expect(timeline.entries$.value).toHaveLength(1);
    expect(timeline.olderCount$.value).toBe(0);
  });
});
