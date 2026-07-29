import {
  Empty,
  IconButton,
  RadioGroup,
  ScrollableContainer,
} from '@affine/component';
import { Header } from '@affine/core/components/pure/header';
import { Timeline, TimelineSetting } from '@affine/core/modules/timeline';
import { useI18n } from '@affine/i18n';
import { HistoryIcon, SortDownIcon, SortUpIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import dayjs from 'dayjs';
import { useCallback, useMemo } from 'react';

import {
  ViewBody,
  ViewHeader,
  ViewIcon,
  ViewTitle,
} from '../../../../modules/workbench';
import * as styles from './index.css';
import { TimelineItem } from './timeline-item';

function formatGroupHeader(
  groupId: string,
  grouping: 'day' | 'week' | 'month'
) {
  if (grouping === 'month') {
    const [year, month] = groupId.split('-');
    return dayjs(`${year}-${month}-01`).format('MMMM YYYY');
  }
  if (grouping === 'week') {
    return groupId;
  }
  return dayjs(groupId).format('dddd, MMMM D, YYYY');
}

const TimelineHeader = () => {
  const t = useI18n();
  const setting = useService(TimelineSetting);
  const grouping = useLiveData(setting.grouping$) ?? 'day';
  const sortDesc = useLiveData(setting.sortDesc$) ?? true;

  const handleGroupingChange = useCallback(
    (value: string) => {
      setting.updateGrouping(value as 'day' | 'week' | 'month');
    },
    [setting]
  );

  const handleToggleSort = useCallback(() => {
    setting.updateSortDesc(!sortDesc);
  }, [setting, sortDesc]);

  return (
    <Header
      left={
        <div className={styles.timelineTitle}>
          <HistoryIcon className={styles.timelineIcon} />
          {t['com.affine.timeline.name']()}
        </div>
      }
      right={
        <div className={styles.headerControls}>
          <RadioGroup
            value={grouping}
            onChange={handleGroupingChange}
            items={[
              { value: 'day', label: t['com.affine.timeline.grouping.day']() },
              {
                value: 'week',
                label: t['com.affine.timeline.grouping.week'](),
              },
              {
                value: 'month',
                label: t['com.affine.timeline.grouping.month'](),
              },
            ]}
          />
          <IconButton
            onClick={handleToggleSort}
            tooltip={
              sortDesc
                ? t['com.affine.timeline.sort.newest-first']()
                : t['com.affine.timeline.sort.oldest-first']()
            }
          >
            {sortDesc ? <SortDownIcon /> : <SortUpIcon />}
          </IconButton>
        </div>
      }
    />
  );
};

export const TimelinePage = () => {
  const t = useI18n();
  const timeline = useService(Timeline);
  const setting = useService(TimelineSetting);
  const groups = useLiveData(timeline.groupedEntries$);
  const grouping = useLiveData(setting.grouping$) ?? 'day';
  const sortDesc = useLiveData(setting.sortDesc$) ?? true;

  const isEmpty = groups.length === 0;

  const sortedGroups = useMemo(() => {
    return [...groups].sort(([a], [b]) =>
      sortDesc ? b.localeCompare(a) : a.localeCompare(b)
    );
  }, [groups, sortDesc]);

  return (
    <>
      <ViewTitle title={t['com.affine.timeline.name']()} />
      <ViewIcon icon="timeline" />
      <ViewHeader>
        <TimelineHeader />
      </ViewHeader>
      <ViewBody>
        <div className={styles.body}>
          {isEmpty ? (
            <div className={styles.emptyContainer}>
              <Empty description={t['com.affine.timeline.empty']()} />
            </div>
          ) : (
            <ScrollableContainer className={styles.scrollArea}>
              <div className={styles.listContainer}>
                {sortedGroups.map(([groupId, entries]) => (
                  <div key={groupId} className={styles.groupSection}>
                    <div className={styles.groupHeader}>
                      {formatGroupHeader(groupId, grouping)}
                    </div>
                    {entries.map(entry => (
                      <TimelineItem
                        key={`${entry.docId}:${entry.blockId}`}
                        entry={entry}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </ScrollableContainer>
          )}
        </div>
      </ViewBody>
    </>
  );
};

export const Component = () => {
  return <TimelinePage />;
};
