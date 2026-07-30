import {
  Empty,
  IconButton,
  Menu,
  MenuItem,
  MenuSeparator,
  RadioGroup,
  ScrollableContainer,
  Switch,
} from '@affine/component';
import { Header } from '@affine/core/components/pure/header';
import {
  DEFAULT_INITIAL_LOAD_MONTHS,
  Timeline,
  TimelineSetting,
  type TimelineZoomLevel,
} from '@affine/core/modules/timeline';
import { useI18n } from '@affine/i18n';
import {
  ChartPanelIcon,
  DatabaseListViewIcon,
  DoneIcon,
  HistoryIcon,
  InvisibleIcon,
  MinusIcon,
  PlusIcon,
  SortDownIcon,
  SortUpIcon,
  TagIcon,
} from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import dayjs from 'dayjs';
import { useCallback, useMemo } from 'react';

import {
  ViewBody,
  ViewHeader,
  ViewIcon,
  ViewSidebarTab,
  ViewTitle,
} from '../../../../modules/workbench';
import { BatchProgressProvider } from './batch-progress';
import { GraphicalTimelineView } from './graphical/graphical-timeline-view';
import { ImportButton } from './import-button';
import * as styles from './index.css';
import { LoadOlderRow } from './load-older-row';
import { TimelineLabelsSidebar } from './sidebar/labels-sidebar';
import { TimelineItem } from './timeline-item';

function zoomLevelLabel(
  t: ReturnType<typeof useI18n>,
  zoomLevel: TimelineZoomLevel
) {
  switch (zoomLevel) {
    case 'minute':
      return t['com.affine.timeline.zoom.minute']();
    case 'second':
      return t['com.affine.timeline.zoom.second']();
    case 'hour':
    default:
      return t['com.affine.timeline.zoom.hour']();
  }
}

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

const LOAD_PERIOD_OPTIONS = [1, 3, 6, 12, 0];

const LoadPeriodMenu = () => {
  const t = useI18n();
  const setting = useService(TimelineSetting);
  const months =
    useLiveData(setting.initialLoadMonths$) ?? DEFAULT_INITIAL_LOAD_MONTHS;

  const label = useCallback(
    (m: number) => {
      if (m === 0) return t['com.affine.timeline.load-period.all']();
      if (m === 1) return t['com.affine.timeline.load-period.month']();
      return t.t('com.affine.timeline.load-period.months', {
        count: String(m),
      });
    },
    [t]
  );

  return (
    <Menu
      items={
        <>
          {LOAD_PERIOD_OPTIONS.map(m => (
            <MenuItem
              key={m}
              suffixIcon={months === m ? <DoneIcon /> : undefined}
              onClick={() => setting.updateInitialLoadMonths(m)}
            >
              {label(m)}
            </MenuItem>
          ))}
        </>
      }
    >
      <IconButton
        tooltip={t.t('com.affine.timeline.load-period', {
          period: label(months),
        })}
        data-testid="timeline-load-period-button"
      >
        <HistoryIcon />
      </IconButton>
    </Menu>
  );
};

const HiddenEntriesMenu = () => {
  const t = useI18n();
  const setting = useService(TimelineSetting);
  const timeline = useService(Timeline);
  const hiddenKeysRaw = useLiveData(setting.hiddenEntries$);
  const allEntries = useLiveData(timeline.allEntries$);

  const hiddenKeys = useMemo(() => hiddenKeysRaw ?? [], [hiddenKeysRaw]);

  const hiddenEntries = useMemo(() => {
    const byKey = new Map(
      allEntries.map(entry => [`${entry.docId}:${entry.blockId}`, entry])
    );
    return hiddenKeys.map(key => ({ key, entry: byKey.get(key) }));
  }, [hiddenKeys, allEntries]);

  const handleRestoreAll = useCallback(() => {
    for (const { key } of hiddenEntries) {
      const [docId, blockId] = key.split(':');
      setting.unhideEntry(docId, blockId);
    }
  }, [hiddenEntries, setting]);

  if (hiddenKeys.length === 0) {
    return null;
  }

  return (
    <Menu
      items={
        <>
          {hiddenEntries.map(({ key, entry }) => (
            <MenuItem
              key={key}
              onClick={() => {
                const [docId, blockId] = key.split(':');
                setting.unhideEntry(docId, blockId);
              }}
            >
              {entry
                ? `${entry.docTitle || t['Untitled']()} · ${
                    entry.excerpt || entry.flavour
                  }`.slice(0, 60)
                : key}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem onClick={handleRestoreAll}>
            {t['com.affine.timeline.hidden-entries.restore-all']()}
          </MenuItem>
        </>
      }
    >
      <IconButton
        tooltip={t.t('com.affine.timeline.hidden-entries', {
          count: String(hiddenKeys.length),
        })}
        data-testid="timeline-hidden-entries-button"
      >
        <InvisibleIcon />
      </IconButton>
    </Menu>
  );
};

const TimelineHeader = () => {
  const t = useI18n();
  const setting = useService(TimelineSetting);
  const grouping = useLiveData(setting.grouping$) ?? 'day';
  const sortDesc = useLiveData(setting.sortDesc$) ?? true;
  const viewMode = useLiveData(setting.viewMode$) ?? 'list';
  const zoomLevel = useLiveData(setting.zoomLevel$) ?? 'hour';
  const hideEmptyPeriods = useLiveData(setting.hideEmptyPeriods$) ?? false;
  const isGraphical = viewMode === 'graphical';

  const handleGroupingChange = useCallback(
    (value: string) => {
      setting.updateGrouping(value as 'day' | 'week' | 'month');
    },
    [setting]
  );

  const handleToggleSort = useCallback(() => {
    setting.updateSortDesc(!sortDesc);
  }, [setting, sortDesc]);

  const handleToggleViewMode = useCallback(() => {
    setting.updateViewMode(isGraphical ? 'list' : 'graphical');
  }, [setting, isGraphical]);

  const handleZoomIn = useCallback(() => {
    setting.zoomIn();
  }, [setting]);

  const handleZoomOut = useCallback(() => {
    setting.zoomOut();
  }, [setting]);

  const handleToggleHideEmptyPeriods = useCallback(
    (checked: boolean) => {
      setting.updateHideEmptyPeriods(checked);
    },
    [setting]
  );

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
          {isGraphical ? (
            <>
              <label className={styles.hideEmptyToggle}>
                <Switch
                  checked={hideEmptyPeriods}
                  onChange={handleToggleHideEmptyPeriods}
                />
                {t['com.affine.timeline.graphical.hide-empty-periods']()}
              </label>
              <div className={styles.zoomControls}>
                <IconButton
                  onClick={handleZoomOut}
                  disabled={zoomLevel === 'hour'}
                  tooltip={t['com.affine.timeline.zoom.out']()}
                >
                  <MinusIcon />
                </IconButton>
                <span className={styles.zoomLabel}>
                  {zoomLevelLabel(t, zoomLevel)}
                </span>
                <IconButton
                  onClick={handleZoomIn}
                  disabled={zoomLevel === 'second'}
                  tooltip={t['com.affine.timeline.zoom.in']()}
                >
                  <PlusIcon />
                </IconButton>
              </div>
            </>
          ) : (
            <>
              <RadioGroup
                value={grouping}
                onChange={handleGroupingChange}
                items={[
                  {
                    value: 'day',
                    label: t['com.affine.timeline.grouping.day'](),
                  },
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
            </>
          )}
          <ImportButton />
          <LoadPeriodMenu />
          <HiddenEntriesMenu />
          <IconButton
            onClick={handleToggleViewMode}
            tooltip={
              isGraphical
                ? t['com.affine.timeline.view.list']()
                : t['com.affine.timeline.view.graphical']()
            }
          >
            {isGraphical ? <DatabaseListViewIcon /> : <ChartPanelIcon />}
          </IconButton>
        </div>
      }
    />
  );
};

const TimelineListView = () => {
  const t = useI18n();
  const timeline = useService(Timeline);
  const setting = useService(TimelineSetting);
  const groups = useLiveData(timeline.groupedEntries$);
  const grouping = useLiveData(setting.grouping$) ?? 'day';
  const sortDesc = useLiveData(setting.sortDesc$) ?? true;
  const olderCount = useLiveData(timeline.olderCount$);

  const isEmpty = groups.length === 0 && olderCount === 0;

  const sortedGroups = useMemo(() => {
    return [...groups].sort(([a], [b]) =>
      sortDesc ? b.localeCompare(a) : a.localeCompare(b)
    );
  }, [groups, sortDesc]);

  if (isEmpty) {
    return (
      <div className={styles.emptyContainer}>
        <Empty description={t['com.affine.timeline.empty']()} />
      </div>
    );
  }

  return (
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
        <LoadOlderRow />
      </div>
    </ScrollableContainer>
  );
};

export const TimelinePage = () => {
  const t = useI18n();
  const setting = useService(TimelineSetting);
  const viewMode = useLiveData(setting.viewMode$) ?? 'list';

  return (
    <>
      <ViewTitle title={t['com.affine.timeline.name']()} />
      <ViewIcon icon="timeline" />
      <ViewHeader>
        <TimelineHeader />
      </ViewHeader>
      <ViewBody>
        <BatchProgressProvider>
          <div className={styles.body}>
            {viewMode === 'graphical' ? (
              <GraphicalTimelineView />
            ) : (
              <TimelineListView />
            )}
          </div>
        </BatchProgressProvider>
      </ViewBody>
      <ViewSidebarTab tabId="timeline-labels" icon={<TagIcon />}>
        <ScrollableContainer>
          <TimelineLabelsSidebar />
        </ScrollableContainer>
      </ViewSidebarTab>
    </>
  );
};

export const Component = () => {
  return <TimelinePage />;
};
