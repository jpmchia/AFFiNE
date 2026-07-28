import { Checkbox, MenuItem, PropertyValue } from '@affine/component';
import type { FilterParams } from '@affine/core/modules/collection-rules';
import { type DocRecord, DocService } from '@affine/core/modules/doc';
import { TimelineService } from '@affine/core/modules/timeline';
import { useI18n } from '@affine/i18n';
import { HistoryIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { type ChangeEvent, useCallback } from 'react';

import { PlainTextDocGroupHeader } from '../explorer/docs-view/group-header';
import { StackProperty } from '../explorer/docs-view/stack-property';
import type { GroupHeaderProps } from '../explorer/types';
import { FilterValueMenu } from '../filter/filter-value-menu';
import type { PropertyValueProps } from '../properties/types';
import * as styles from './template.css';

export const IncludeInTimelineValue = ({ readonly }: PropertyValueProps) => {
  const docService = useService(DocService);
  const timelineService = useService(TimelineService);

  const includeInTimeline = useLiveData(
    docService.doc.record.properties$.selector(p => p.includeInTimeline)
  );

  const applyValue = useCallback(
    (value: boolean) => {
      docService.doc.record.setProperty('includeInTimeline', value);
      if (value) {
        timelineService.backfillDoc(docService.doc.id);
      }
    },
    [docService.doc, timelineService]
  );

  const onChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (readonly) return;
      applyValue(e.target.checked);
    },
    [applyValue, readonly]
  );

  const toggle = useCallback(() => {
    if (readonly) return;
    applyValue(!includeInTimeline);
  }, [applyValue, includeInTimeline, readonly]);

  return (
    <PropertyValue className={styles.property} onClick={toggle} readonly>
      <Checkbox
        data-testid="toggle-include-in-timeline-checkbox"
        checked={!!includeInTimeline}
        onChange={onChange}
        className={styles.checkbox}
        disabled={readonly}
      />
    </PropertyValue>
  );
};

export const IncludeInTimelineDocListProperty = ({
  doc,
}: {
  doc: DocRecord;
}) => {
  const t = useI18n();
  const includeInTimeline = useLiveData(
    doc.properties$.selector(p => p.includeInTimeline)
  );

  if (!includeInTimeline) {
    return null;
  }

  return (
    <StackProperty icon={<HistoryIcon />}>
      {t['com.affine.timeline.name']()}
    </StackProperty>
  );
};

export const IncludeInTimelineGroupHeader = ({
  groupId,
  docCount,
}: GroupHeaderProps) => {
  const t = useI18n();
  const text =
    groupId === 'true'
      ? t['com.affine.all-docs.group.is-in-timeline']()
      : groupId === 'false'
        ? t['com.affine.all-docs.group.is-not-in-timeline']()
        : 'Default';

  return (
    <PlainTextDocGroupHeader groupId={groupId} docCount={docCount}>
      {text}
    </PlainTextDocGroupHeader>
  );
};

export const IncludeInTimelineFilterValue = ({
  filter,
  isDraft,
  onDraftCompleted,
  onChange,
}: {
  filter: FilterParams;
  isDraft?: boolean;
  onDraftCompleted?: () => void;
  onChange?: (filter: FilterParams) => void;
}) => {
  return (
    <FilterValueMenu
      isDraft={isDraft}
      onDraftCompleted={onDraftCompleted}
      items={
        <>
          <MenuItem
            onClick={() => {
              onChange?.({
                ...filter,
                value: 'true',
              });
            }}
            selected={filter.value === 'true'}
          >
            {'True'}
          </MenuItem>
          <MenuItem
            onClick={() => {
              onChange?.({
                ...filter,
                value: 'false',
              });
            }}
            selected={filter.value !== 'true'}
          >
            {'False'}
          </MenuItem>
        </>
      }
    >
      <span>{filter.value === 'true' ? 'True' : 'False'}</span>
    </FilterValueMenu>
  );
};
