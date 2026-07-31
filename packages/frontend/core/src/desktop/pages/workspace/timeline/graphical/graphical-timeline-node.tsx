import {
  ContextMenu,
  MenuItem,
  MenuSeparator,
  MenuSub,
} from '@affine/component';
import { DocDisplayMetaService } from '@affine/core/modules/doc-display-meta';
import { PeekViewService } from '@affine/core/modules/peek-view';
import {
  parseLeadingDateTime,
  parseLeadingTag,
  stripParsedPrefix,
  Timeline,
  type TimelineEntry,
  TimelineSetting,
  type TimelineZoomLevel,
} from '@affine/core/modules/timeline';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import {
  DeleteIcon,
  DoneIcon,
  HistoryIcon,
  PlusIcon,
  TagIcon,
} from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import dayjs from 'dayjs';
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useBatchProgress } from '../batch-progress';
import { TagPills, useEntryLabels } from '../entry-labels';
import { TimelineItemPreview } from '../timeline-item-preview';
import * as styles from './graphical-timeline.css';
import type { GraphicalTimelineLayout, TimelineNodeLayout } from './layout';
import { entryKey, yToTime } from './layout';
import type { MergedTimelineEntry } from './merge';

const DRAG_THRESHOLD = 4;

/** the plain text of a preview, used for date parsing */
function previewText(entry: TimelineEntry): string {
  const p = entry.preview;
  if (
    p.kind === 'text' ||
    p.kind === 'list' ||
    p.kind === 'code' ||
    p.kind === 'callout'
  ) {
    return p.text;
  }
  return entry.excerpt;
}

/** a merged card expands to its members; a plain card is itself */
function expandEntry(entry: MergedTimelineEntry): TimelineEntry[] {
  return entry.mergedEntries ?? [entry];
}

export const GraphicalTimelineNode = memo(function GraphicalTimelineNode({
  node,
  layout,
  zoomLevel,
  selected,
  selectedKeys,
  onSelectClick,
  onGroupSelection,
  onMergeSelection,
  onHeightChange,
}: {
  node: TimelineNodeLayout;
  layout: GraphicalTimelineLayout;
  zoomLevel: TimelineZoomLevel;
  selected: boolean;
  /** all currently selected entry keys */
  selectedKeys: string[];
  onSelectClick: (
    key: string,
    mods: { ctrlKey: boolean; shiftKey: boolean }
  ) => void;
  onGroupSelection: () => void;
  onMergeSelection: () => void;
  onHeightChange: (key: string, height: number) => void;
}) {
  const { side, axisY, cardY, groupId, isPeriod, axisEndY } = node;
  const entry = node.entry as MergedTimelineEntry;
  const key = entryKey(entry);
  const t = useI18n();
  const peekView = useService(PeekViewService).peekView;
  const workbench = useService(WorkbenchService).workbench;
  const timeline = useService(Timeline);
  const setting = useService(TimelineSetting);
  const docDisplayMetaService = useService(DocDisplayMetaService);
  const DocIcon = useLiveData(docDisplayMetaService.icon$(entry.docId));
  const batch = useBatchProgress();

  const tagsRaw = useLiveData(setting.tags$);
  const categories = useLiveData(setting.categories$) ?? [];
  const entryTagsRaw = useLiveData(setting.entryTags$);
  const entryCategoriesRaw = useLiveData(setting.entryCategories$);
  const datePrefixesRaw = useLiveData(setting.entryDatePrefixes$);
  const tagPrefixesRaw = useLiveData(setting.entryTagPrefixes$);
  const tags = useMemo(() => tagsRaw ?? [], [tagsRaw]);
  const datePrefixes = useMemo(() => datePrefixesRaw ?? {}, [datePrefixesRaw]);
  const tagPrefixes = useMemo(() => tagPrefixesRaw ?? {}, [tagPrefixesRaw]);
  const entryTags = useMemo(() => entryTagsRaw ?? {}, [entryTagsRaw]);
  const entryCategories = useMemo(
    () => entryCategoriesRaw ?? {},
    [entryCategoriesRaw]
  );

  const { category, assignedTags } = useEntryLabels(key);
  const tagColor = assignedTags[0]?.color;
  const accentColor = tagColor ?? category?.color;

  const mergedEntries = entry.mergedEntries;
  const isMerged = !!entry.mergeId && !!mergedEntries;

  // when this card is part of a multi-selection, context menu actions apply
  // to every selected card
  const multiTarget = selected && selectedKeys.length > 1;
  const targetKeys = useMemo(
    () => (multiTarget ? selectedKeys : [key]),
    [multiTarget, selectedKeys, key]
  );
  const entriesByKey = useMemo(() => {
    const map = new Map<string, MergedTimelineEntry>();
    for (const n of layout.nodes) {
      map.set(entryKey(n.entry), n.entry as MergedTimelineEntry);
    }
    return map;
  }, [layout.nodes]);
  const targetEntries = useMemo(
    () =>
      targetKeys
        .map(k => entriesByKey.get(k))
        .filter((e): e is MergedTimelineEntry => !!e),
    [targetKeys, entriesByKey]
  );

  const cardRef = useRef<HTMLDivElement | null>(null);
  const suppressClickRef = useRef(false);

  // drag state: current axis y while dragging, or null when idle
  const [dragY, setDragY] = useState<number | null>(null);
  const dragStartRef = useRef<{ pointerY: number; axisY: number } | null>(null);

  // report measured content height to the layout
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      onHeightChange(key, el.offsetHeight);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [key, onHeightChange]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (isPeriod) return;
      // ignore drags starting on the native resize handle (bottom-right corner)
      const rect = e.currentTarget.getBoundingClientRect();
      if (rect.right - e.clientX < 16 && rect.bottom - e.clientY < 16) return;
      dragStartRef.current = { pointerY: e.clientY, axisY: node.axisY };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [node.axisY, isPeriod]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const start = dragStartRef.current;
      if (!start) return;
      const dy = e.clientY - start.pointerY;
      if (dragY === null && Math.abs(dy) < DRAG_THRESHOLD) return;
      setDragY(start.axisY + dy);
    },
    [dragY]
  );

  const endDrag = useCallback(
    (commit: boolean) => {
      const wasDragging = dragY !== null;
      dragStartRef.current = null;
      if (!wasDragging) return;
      suppressClickRef.current = true;
      if (commit) {
        const newTime = yToTime(layout, dragY, zoomLevel, key);
        timeline.updateDisplayAtBatch(
          expandEntry(entry).map(member => ({
            docId: member.docId,
            blockId: member.blockId,
            displayAt: newTime,
          }))
        );
      }
      setDragY(null);
    },
    [dragY, layout, zoomLevel, key, timeline, entry]
  );

  const handlePointerUp = useCallback(() => endDrag(true), [endDrag]);
  const handlePointerCancel = useCallback(() => endDrag(false), [endDrag]);

  // single click selects...
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      onSelectClick(key, {
        ctrlKey: e.ctrlKey || e.metaKey,
        shiftKey: e.shiftKey,
      });
    },
    [key, onSelectClick]
  );

  // ...double click opens the editor
  const handleDoubleClick = useCallback(() => {
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
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      workbench.openDoc({ docId: entry.docId, blockIds: [entry.blockId] });
    },
    [entry.blockId, entry.docId, workbench]
  );

  const handleRemoveFromTimeline = useCallback(() => {
    setting.hideEntries(
      targetEntries.flatMap(target => expandEntry(target).map(entryKey))
    );
  }, [setting, targetEntries]);

  const handleUngroup = useCallback(() => {
    if (groupId) setting.ungroup(groupId);
  }, [setting, groupId]);

  const handleUnmerge = useCallback(() => {
    if (entry.mergeId) setting.unmerge(entry.mergeId);
  }, [setting, entry.mergeId]);

  // a tag is "on" for the selection when every target has it
  const tagOnAll = useCallback(
    (tagId: string) =>
      targetKeys.every(k => (entryTags[k] ?? []).includes(tagId)),
    [targetKeys, entryTags]
  );

  const handleToggleTag = useCallback(
    (tagId: string) => {
      setting.setEntryTagBatch(targetKeys, tagId, !tagOnAll(tagId));
    },
    [setting, targetKeys, tagOnAll]
  );

  const categoryOnAll = useCallback(
    (categoryId: string) =>
      targetKeys.every(k => entryCategories[k] === categoryId),
    [targetKeys, entryCategories]
  );

  const handleSetCategory = useCallback(
    (categoryId: string) => {
      setting.setEntryCategoryBatch(
        targetKeys,
        categoryOnAll(categoryId) ? null : categoryId
      );
    },
    [setting, targetKeys, categoryOnAll]
  );

  const handleCreateTag = useCallback(() => {
    const id = setting.createTag(
      t.t('com.affine.timeline.tags.default-name', {
        number: String(tags.length + 1),
      })
    );
    setting.setEntryTagBatch(targetKeys, id, true);
  }, [setting, t, tags.length, targetKeys]);

  const handleCreateCategory = useCallback(() => {
    const id = setting.createCategory(
      t.t('com.affine.timeline.categories.default-name', {
        number: String(categories.length + 1),
      })
    );
    setting.setEntryCategoryBatch(targetKeys, id);
  }, [setting, t, categories.length, targetKeys]);

  const handleParseDateTime = useCallback(() => {
    // parsing is cheap; do it upfront and apply the results in chunks with
    // one yjs transaction per doc and a single settings write
    const prefixes: Record<string, string> = {};
    const byDoc = new Map<
      string,
      { docId: string; blockId: string; displayAt: number }[]
    >();
    for (const target of targetEntries) {
      for (const member of expandEntry(target)) {
        const memberKey = entryKey(member);
        // a previously parsed tag prefix may sit before the date/time
        const parsed = parseLeadingDateTime(
          stripParsedPrefix(previewText(member), tagPrefixes[memberKey]),
          member.displayInTimelineAt
        );
        if (!parsed) continue;
        prefixes[memberKey] = parsed.matchedText;
        const docUpdates = byDoc.get(member.docId) ?? [];
        docUpdates.push({
          docId: member.docId,
          blockId: member.blockId,
          displayAt: parsed.timestamp,
        });
        byDoc.set(member.docId, docUpdates);
      }
    }
    if (byDoc.size === 0) return;
    batch
      .run(
        t['com.affine.timeline.parse-datetime'](),
        [...byDoc.values()],
        docUpdates => timeline.updateDisplayAtBatch(docUpdates)
      )
      .then(() => setting.setEntryDatePrefixBatch(prefixes))
      .catch(console.error);
  }, [batch, t, timeline, setting, targetEntries, tagPrefixes]);

  const handleParseTags = useCallback(() => {
    // per-entry matches grouped by tag id so each tag is one settings write
    const prefixes: Record<string, string> = {};
    const byTag = new Map<string, string[]>();
    for (const target of targetEntries) {
      for (const member of expandEntry(target)) {
        const memberKey = entryKey(member);
        // a previously parsed date/time prefix may sit before the tag
        const parsed = parseLeadingTag(
          stripParsedPrefix(previewText(member), datePrefixes[memberKey]),
          tags
        );
        if (!parsed) continue;
        prefixes[memberKey] = parsed.matchedText;
        const keys = byTag.get(parsed.tagId) ?? [];
        keys.push(memberKey);
        byTag.set(parsed.tagId, keys);
      }
    }
    if (byTag.size === 0) return;
    batch
      .run(t['com.affine.timeline.parse-tags'](), [...byTag], ([tagId, keys]) =>
        setting.setEntryTagBatch(keys, tagId, true)
      )
      .then(() => setting.setEntryTagPrefixBatch(prefixes))
      .catch(console.error);
  }, [batch, t, setting, targetEntries, tags, datePrefixes]);

  const isDragging = dragY !== null;
  const effectiveAxisY = dragY ?? axisY;
  const effectiveCardY = dragY ?? cardY;
  const previewTime = isDragging
    ? yToTime(layout, dragY, zoomLevel, key)
    : entry.displayInTimelineAt;
  const timeFormat = zoomLevel === 'second' ? 'HH:mm:ss' : 'HH:mm';
  const endAt = entry.displayInTimelineEndAt;
  const startTime = entry.displayInTimelineAt;
  let timeLabel = dayjs(startTime).format(timeFormat);
  if (endAt) {
    const isSameDay = dayjs(startTime).isSame(endAt, 'day');
    const endFormat = isSameDay ? timeFormat : `MMM D, ${timeFormat}`;
    timeLabel = `${timeLabel} — ${dayjs(endAt).format(endFormat)}`;
  }

  const isChat =
    assignedTags.length > 0 &&
    ['affine:paragraph', 'affine:image', 'affine:attachment'].includes(
      entry.flavour
    );
  const cardClassNames = [
    styles.card,
    side === 'left' ? styles.cardLeft : styles.cardRight,
    isChat ? styles.cardChat : '',
    isChat
      ? side === 'left'
        ? styles.cardChatLeft
        : styles.cardChatRight
      : '',
    selected ? styles.cardSelected : '',
    groupId ? styles.cardGrouped : '',
  ]
    .filter(Boolean)
    .join(' ');

  const contextMenuItems = (
    <>
      {multiTarget ? (
        <>
          <MenuItem
            onClick={onGroupSelection}
            data-testid="graphical-timeline-group"
          >
            {t.t('com.affine.timeline.selection.group-count', {
              count: String(targetKeys.length),
            })}
          </MenuItem>
          <MenuItem
            onClick={onMergeSelection}
            data-testid="graphical-timeline-merge"
          >
            {t.t('com.affine.timeline.selection.merge-count', {
              count: String(targetKeys.length),
            })}
          </MenuItem>
          <MenuSeparator />
        </>
      ) : null}
      {groupId ? (
        <MenuItem
          onClick={handleUngroup}
          data-testid="graphical-timeline-ungroup"
        >
          {t['com.affine.timeline.selection.ungroup']()}
        </MenuItem>
      ) : null}
      {entry.mergeId ? (
        <MenuItem
          onClick={handleUnmerge}
          data-testid="graphical-timeline-unmerge"
        >
          {t['com.affine.timeline.selection.unmerge']()}
        </MenuItem>
      ) : null}
      <MenuItem
        prefixIcon={<HistoryIcon />}
        onClick={handleParseDateTime}
        data-testid="graphical-timeline-parse-datetime"
      >
        {t['com.affine.timeline.parse-datetime']()}
      </MenuItem>
      <MenuItem
        prefixIcon={<TagIcon />}
        onClick={handleParseTags}
        data-testid="graphical-timeline-parse-tags"
      >
        {t['com.affine.timeline.parse-tags']()}
      </MenuItem>
      <MenuSeparator />
      <MenuSub
        triggerOptions={{ prefixIcon: <TagIcon /> }}
        items={
          <>
            {tags.map(tag => (
              <MenuItem
                key={tag.id}
                prefixIcon={
                  <span
                    className={styles.labelDot}
                    style={{ background: tag.color }}
                  />
                }
                suffixIcon={tagOnAll(tag.id) ? <DoneIcon /> : undefined}
                onClick={() => handleToggleTag(tag.id)}
              >
                {tag.name}
              </MenuItem>
            ))}
            {tags.length > 0 ? <MenuSeparator /> : null}
            <MenuItem prefixIcon={<PlusIcon />} onClick={handleCreateTag}>
              {t['com.affine.timeline.tags.new']()}
            </MenuItem>
          </>
        }
      >
        {t['com.affine.timeline.tags']()}
      </MenuSub>
      <MenuSub
        triggerOptions={{ prefixIcon: <TagIcon /> }}
        items={
          <>
            {categories.map(cat => (
              <MenuItem
                key={cat.id}
                prefixIcon={
                  <span
                    className={styles.labelDot}
                    style={{ background: cat.color }}
                  />
                }
                suffixIcon={categoryOnAll(cat.id) ? <DoneIcon /> : undefined}
                onClick={() => handleSetCategory(cat.id)}
              >
                {cat.name}
              </MenuItem>
            ))}
            {categories.length > 0 ? <MenuSeparator /> : null}
            <MenuItem prefixIcon={<PlusIcon />} onClick={handleCreateCategory}>
              {t['com.affine.timeline.categories.new']()}
            </MenuItem>
          </>
        }
      >
        {t['com.affine.timeline.categories']()}
      </MenuSub>
      <MenuSeparator />
      <MenuItem
        prefixIcon={<DeleteIcon />}
        type="danger"
        onClick={handleRemoveFromTimeline}
        data-testid="graphical-timeline-remove"
      >
        {t['com.affine.timeline.remove-from-timeline']()}
      </MenuItem>
    </>
  );

  return (
    <>
      {isPeriod && axisEndY != null ? (
        <div
          className={styles.periodBlock}
          style={{
            top: effectiveAxisY,
            height: Math.max(axisEndY - effectiveAxisY, 0),
            background: accentColor,
          }}
          data-testid="graphical-timeline-period"
        />
      ) : null}
      {!isPeriod ? (
        <div
          className={styles.nodeDot}
          style={{
            top: effectiveAxisY,
            background: accentColor,
            borderColor: accentColor,
          }}
          data-testid="graphical-timeline-dot"
        />
      ) : null}
      <div
        className={styles.connector}
        style={{
          top: effectiveAxisY,
          [side === 'left' ? 'right' : 'left']: '50%',
          width: styles.AXIS_CARD_MARGIN,
          background: accentColor,
        }}
      />
      {isDragging ? (
        <div
          className={styles.dragTimeIndicator}
          style={{ top: effectiveAxisY - 24 }}
          data-testid="graphical-timeline-drag-indicator"
        >
          {dayjs(previewTime).format('YYYY-MM-DD HH:mm:ss')}
        </div>
      ) : null}
      <ContextMenu asChild items={contextMenuItems}>
        <div
          ref={cardRef}
          className={cardClassNames}
          style={{
            top: effectiveCardY - 12,
            // tag/category colours the card border; selection ring wins visually
            borderColor: selected ? undefined : accentColor,
          }}
          data-dragging={isDragging}
          data-key={key}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          data-testid="graphical-timeline-card"
        >
          <div className={styles.cardHeader}>
            {side === 'left' ? (
              <>
                <div className={styles.cardTitleGroup}>
                  <DocIcon />
                  <span className={styles.cardDocTitle} onClick={handleOpenDoc}>
                    {entry.docTitle || t['Untitled']()}
                  </span>
                </div>
                <div className={styles.cardMetaGroup}>
                  {isMerged && mergedEntries ? (
                    <span className={styles.mergedBadge}>
                      {t.t('com.affine.timeline.merged-count', {
                        count: String(mergedEntries.length),
                      })}
                    </span>
                  ) : null}
                  <TagPills tags={assignedTags} />
                  <span className={styles.cardTime}>{timeLabel}</span>
                </div>
              </>
            ) : (
              <>
                <div className={styles.cardMetaGroup}>
                  <span className={styles.cardTime}>{timeLabel}</span>
                  <TagPills tags={assignedTags} />
                  {isMerged && mergedEntries ? (
                    <span className={styles.mergedBadge}>
                      {t.t('com.affine.timeline.merged-count', {
                        count: String(mergedEntries.length),
                      })}
                    </span>
                  ) : null}
                </div>
                <div className={styles.cardTitleGroup}>
                  <span className={styles.cardDocTitle} onClick={handleOpenDoc}>
                    {entry.docTitle || t['Untitled']()}
                  </span>
                  <DocIcon />
                </div>
              </>
            )}
          </div>
          {isMerged && mergedEntries ? (
            mergedEntries.map((member, index) => (
              <Fragment key={entryKey(member)}>
                {index > 0 ? <div className={styles.mergedDivider} /> : null}
                <TimelineItemPreview
                  preview={member.preview}
                  hidePrefix={datePrefixes[entryKey(member)]}
                  hideTagPrefix={tagPrefixes[entryKey(member)]}
                />
              </Fragment>
            ))
          ) : (
            <TimelineItemPreview
              preview={entry.preview}
              hidePrefix={datePrefixes[key]}
              hideTagPrefix={tagPrefixes[key]}
            />
          )}
        </div>
      </ContextMenu>
    </>
  );
});
