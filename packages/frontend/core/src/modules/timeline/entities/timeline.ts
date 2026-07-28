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

export class Timeline extends Entity {
  constructor(
    private readonly store: TimelineStore,
    private readonly setting: TimelineSetting
  ) {
    super();
  }

  entries$ = LiveData.from<TimelineEntry[]>(this.store.watchEntries(), []);

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
}
