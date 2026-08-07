import { Entity, LiveData } from '@toeverything/infra';
import { groupBy as rxGroupBy } from 'lodash-es';

import type { TimelineStore } from '../store/timeline';
import type { TimelineEntry, TimelineGrouping } from '../type';
import type { TimelineSetting } from './setting';

function groupKey(timestamp: number, grouping: TimelineGrouping): string {
  const date = new Date(timestamp);
  if (grouping === 'month') {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
  if (grouping === 'week') {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDays = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    const week = Math.ceil((pastDays + firstDayOfYear.getDay() + 1) / 7);
    return `${date.getFullYear()}-W${String(week).padStart(2, '0')}`;
  }
  return date.toISOString().slice(0, 10);
}

export const DEFAULT_INITIAL_LOAD_MONTHS = 3;

export class Timeline extends Entity {
  constructor(
    private readonly store: TimelineStore,
    private readonly setting: TimelineSetting
  ) {
    super();
  }

  allEntries$ = LiveData.from<TimelineEntry[]>(this.store.watchEntries(), []);

  private readonly unwindowedEntries$ = LiveData.computed(get => {
    const entries = get(this.allEntries$);
    const hidden = get(this.setting.hiddenEntries$);
    if (!hidden || hidden.length === 0) return entries;
    const hiddenSet = new Set(hidden);
    return entries.filter(
      entry => !hiddenSet.has(`${entry.docId}:${entry.blockId}`)
    );
  });

  /** Entries grouped by month bucket (YYYY-MM) for the navigator. */
  monthBuckets$ = LiveData.computed(get => {
    const entries = get(this.unwindowedEntries$);
    const buckets = new Map<string, TimelineEntry[]>();
    for (const entry of entries) {
      const key = groupKey(entry.displayInTimelineAt, 'month');
      const list = buckets.get(key);
      if (list) {
        list.push(entry);
      } else {
        buckets.set(key, [entry]);
      }
    }
    return buckets;
  });

  /** Extra months loaded on demand beyond the configured initial window. */
  private readonly extendedMonths$ = new LiveData<number>(0);

  /** Oldest visible timestamp, or null when everything is shown. */
  loadCutoff$ = LiveData.computed(get => {
    const months =
      get(this.setting.initialLoadMonths$) ?? DEFAULT_INITIAL_LOAD_MONTHS;
    if (months <= 0) return null;
    const extended = get(this.extendedMonths$);
    if (!Number.isFinite(extended)) return null;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - (months + extended));
    return cutoff.getTime();
  });

  private readonly viewRanged$ = LiveData.computed(get => {
    const entries = get(this.unwindowedEntries$);
    const range = get(this.setting.viewRange$);
    if (!range) return entries;
    return entries.filter(entry => {
      const start = entry.displayInTimelineAt;
      const end = entry.displayInTimelineEndAt ?? start;
      return start < range.end && end >= range.start;
    });
  });

  private readonly windowed$ = LiveData.computed(get => {
    const entries = get(this.viewRanged$);
    const range = get(this.setting.viewRange$);
    if (range) return { entries, olderCount: 0 };
    const cutoff = get(this.loadCutoff$);
    if (cutoff === null) return { entries, olderCount: 0 };
    const visible = entries.filter(
      entry => entry.displayInTimelineAt >= cutoff
    );
    return { entries: visible, olderCount: entries.length - visible.length };
  });

  entries$ = LiveData.computed(get => get(this.windowed$).entries);

  /** Entries currently hidden by the initial-load window. */
  olderCount$ = LiveData.computed(get => get(this.windowed$).olderCount);

  /** Extends the visible window back by one more configured period. */
  loadOlder() {
    const months =
      this.setting.initialLoadMonths$.value ?? DEFAULT_INITIAL_LOAD_MONTHS;
    this.extendedMonths$.next(this.extendedMonths$.value + Math.max(months, 1));
  }

  /** Removes the window entirely for this session. */
  loadAll() {
    this.extendedMonths$.next(Infinity);
  }

  sortedEntries$ = LiveData.computed(get => {
    const entries = get(this.entries$);
    const desc = get(this.setting.sortDesc$) ?? true;
    return [...entries].sort((a, b) =>
      desc
        ? b.displayInTimelineAt - a.displayInTimelineAt
        : a.displayInTimelineAt - b.displayInTimelineAt
    );
  });

  groupedEntries$ = LiveData.computed(get => {
    const entries = get(this.sortedEntries$);
    const grouping = get(this.setting.grouping$) ?? 'day';
    const groups = rxGroupBy(entries, entry =>
      groupKey(entry.displayInTimelineAt, grouping)
    );
    return Object.entries(groups) as [string, TimelineEntry[]][];
  });

  updateDisplayAt(docId: string, blockId: string, displayAt: number) {
    this.store.updateDisplayAt(docId, blockId, displayAt);
  }

  /** Applies many display-at updates with one transaction per doc. */
  updateDisplayAtBatch(
    updates: { docId: string; blockId: string; displayAt: number }[]
  ) {
    this.store.updateDisplayAtBatch(updates);
  }
}
