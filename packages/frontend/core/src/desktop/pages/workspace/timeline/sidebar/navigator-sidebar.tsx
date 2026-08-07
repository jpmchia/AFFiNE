import { Timeline, TimelineSetting } from '@affine/core/modules/timeline';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import dayjs from 'dayjs';
import { useCallback, useMemo } from 'react';

import * as styles from './navigator-sidebar.css';

export const TimelineNavigatorSidebar = () => {
  const t = useI18n();
  const timeline = useService(Timeline);
  const setting = useService(TimelineSetting);
  const monthBuckets = useLiveData(timeline.monthBuckets$);
  const viewRange = useLiveData(setting.viewRange$);

  const years = useMemo(() => {
    const keys = [...monthBuckets.keys()].sort().reverse();
    const byYear = new Map<
      string,
      { key: string; label: string; count: number }[]
    >();
    for (const key of keys) {
      const [year] = key.split('-');
      const label = dayjs(`${key}-01`).format('MMMM');
      const count = monthBuckets.get(key)?.length ?? 0;
      const list = byYear.get(year) ?? [];
      list.push({ key, label, count });
      byYear.set(year, list);
    }
    return [...byYear.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [monthBuckets]);

  const handleSelect = useCallback(
    (key: string) => {
      const start = dayjs(`${key}-01`).startOf('month').valueOf();
      const end = dayjs(`${key}-01`).endOf('month').valueOf() + 1;
      setting.updateViewRange(start, end);
    },
    [setting]
  );

  const handleClear = useCallback(() => {
    setting.clearViewRange();
  }, [setting]);

  const isActive = (start: number, end: number) =>
    viewRange?.start === start && viewRange?.end === end;

  return (
    <div className={styles.container} data-testid="timeline-navigator-sidebar">
      <div className={styles.header}>
        <span className={styles.title}>
          {t['com.affine.timeline.navigator']?.() ?? 'Months'}
        </span>
        {viewRange ? (
          <button
            type="button"
            className={styles.clearButton}
            onClick={handleClear}
          >
            {t['com.affine.timeline.navigator.clear']?.() ?? 'All'}
          </button>
        ) : null}
      </div>
      <div className={styles.list}>
        {years.length === 0 ? (
          <div className={styles.empty}>
            {t['com.affine.timeline.navigator.empty']?.() ?? 'No entries'}
          </div>
        ) : (
          years.map(([year, months]) => (
            <div key={year} className={styles.year}>
              <div className={styles.yearLabel}>{year}</div>
              {months.map(({ key, label, count: monthCount }) => {
                const start = dayjs(`${key}-01`).startOf('month').valueOf();
                const end = dayjs(`${key}-01`).endOf('month').valueOf() + 1;
                const active = isActive(start, end);
                return (
                  <button
                    key={key}
                    type="button"
                    className={styles.month}
                    data-active={active}
                    onClick={() => handleSelect(key)}
                  >
                    <span className={styles.monthLabel}>{label}</span>
                    <span className={styles.count}>{monthCount}</span>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
