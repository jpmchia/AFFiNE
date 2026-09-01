import { Menu } from '@affine/component';
import { DocDisplayMetaService } from '@affine/core/modules/doc-display-meta';
import { PeekViewService } from '@affine/core/modules/peek-view';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import dayjs from 'dayjs';
import { useCallback, useState } from 'react';

import {
  Timeline,
  type TimelineEntry,
  TimelineSetting,
} from '../../../../modules/timeline';
import { OrganizeService } from '@affine/core/modules/organize';
import { categoryBorderStyle, TagPills, useEntryLabels } from './entry-labels';
import * as styles from './index.css';
import { TimelineItemPreview } from './timeline-item-preview';

export const TimelineItem = ({ entry }: { entry: TimelineEntry }) => {
  const t = useI18n();
  const peekView = useService(PeekViewService).peekView;
  const workbench = useService(WorkbenchService).workbench;
  const timeline = useService(Timeline);
  const docDisplayMetaService = useService(DocDisplayMetaService);
  const DocIcon = useLiveData(docDisplayMetaService.icon$(entry.docId));
  const setting = useService(TimelineSetting);
  const datePrefixes = useLiveData(setting.entryDatePrefixes$) ?? {};
  const tagPrefixes = useLiveData(setting.entryTagPrefixes$) ?? {};
  const { category, assignedTags } = useEntryLabels(
    `${entry.docId}:${entry.blockId}`
  );
  const titleColor = category?.color ?? entry.color ?? assignedTags[0]?.color;
  const organizeService = useService(OrganizeService);
  const folderPath = useLiveData(
    organizeService.folderTree.docFolderPath$(entry.docId)
  );
  const displayTitle = folderPath
    ? `${folderPath} / ${entry.docTitle || t['Untitled']()}`
    : entry.docTitle || t['Untitled']();
  const [draftValue, setDraftValue] = useState(() =>
    dayjs(entry.displayInTimelineAt).format('YYYY-MM-DDTHH:mm')
  );

  const handleOpen = useCallback(() => {
    peekView
      .open({
        type: 'doc',
        docRef: { docId: entry.docId, blockIds: [entry.blockId] },
      })
      .catch(console.error);
  }, [entry.blockId, entry.docId, peekView]);

  const handleOpenDoc = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      workbench.openDoc({ docId: entry.docId, blockIds: [entry.blockId] });
    },
    [entry.blockId, entry.docId, workbench]
  );

  const handleTimeClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const handleDraftChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setDraftValue(e.target.value);
    },
    []
  );

  const handleCommitDate = useCallback(() => {
    const parsed = dayjs(draftValue);
    if (parsed.isValid()) {
      timeline.updateDisplayAt(entry.docId, entry.blockId, parsed.valueOf());
    }
  }, [draftValue, entry.blockId, entry.docId, timeline]);

  return (
    <div
      className={styles.item}
      style={categoryBorderStyle(category)}
      onClick={handleOpen}
      data-testid="timeline-item"
    >
      <div className={styles.itemHeader}>
        <DocIcon />
        <span className={styles.itemDocTitle} onClick={handleOpenDoc}>
          {displayTitle}
        </span>
        <TagPills tags={assignedTags} />
        <Menu
          items={
            <div className={styles.dateEditor} onClick={handleTimeClick}>
              <input
                type="datetime-local"
                value={draftValue}
                onChange={handleDraftChange}
                onBlur={handleCommitDate}
                data-testid="timeline-item-date-input"
              />
            </div>
          }
          rootOptions={{ onOpenChange: open => !open && handleCommitDate() }}
        >
          <span
            className={styles.itemTime}
            onClick={handleTimeClick}
            data-testid="timeline-item-time"
            title={t['com.affine.timeline.edit-date']()}
          >
            {dayjs(entry.displayInTimelineAt).format('YYYY-MM-DD HH:mm')}
          </span>
        </Menu>
      </div>
      {entry.title ? (
        <div
          className={styles.itemTitle}
          style={{ color: titleColor }}
          data-testid="timeline-item-title"
        >
          {entry.title}
        </div>
      ) : null}
      <TimelineItemPreview
        preview={entry.preview}
        hidePrefix={datePrefixes[`${entry.docId}:${entry.blockId}`]}
        hideTagPrefix={tagPrefixes[`${entry.docId}:${entry.blockId}`]}
      />
    </div>
  );
};
