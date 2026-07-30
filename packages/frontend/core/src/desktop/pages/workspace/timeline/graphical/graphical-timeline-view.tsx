import { Button, Empty, ScrollableContainer } from '@affine/component';
import { Timeline, TimelineSetting } from '@affine/core/modules/timeline';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import dayjs from 'dayjs';
import { useCallback, useMemo, useRef, useState } from 'react';

import * as pageStyles from '../index.css';
import { LoadOlderRow } from '../load-older-row';
import * as styles from './graphical-timeline.css';
import { GraphicalTimelineNode } from './graphical-timeline-node';
import { computeGraphicalTimelineLayout, entryKey } from './layout';
import { applyMerges } from './merge';

function formatGapDuration(startTime: number, endTime: number): string {
  const ms = endTime - startTime;
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days}d`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `${hours}h`;
  const minutes = Math.floor(ms / 60_000);
  return `${minutes}m`;
}

interface MarqueeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** px rendered above/below the viewport so scrolling never shows gaps */
const OVERSCAN = 800;
/** scroll positions are bucketed to avoid re-rendering on every frame */
const SCROLL_BUCKET = 200;
/** assumed card height until the real one has been measured */
const ESTIMATED_CARD_HEIGHT = 120;

export const GraphicalTimelineView = () => {
  const t = useI18n();
  const timeline = useService(Timeline);
  const setting = useService(TimelineSetting);
  const rawEntries = useLiveData(timeline.entries$);
  const olderCount = useLiveData(timeline.olderCount$);
  const zoomLevel = useLiveData(setting.zoomLevel$) ?? 'hour';
  const hideEmptyPeriods = useLiveData(setting.hideEmptyPeriods$) ?? false;
  const entryGroups = useLiveData(setting.entryGroups$);
  const entryMerges = useLiveData(setting.entryMerges$);

  // merged sets collapse into single synthetic entries before layout
  const entries = useMemo(
    () => applyMerges(rawEntries, entryMerges),
    [rawEntries, entryMerges]
  );

  // ---- virtualization: track the visible scroll window ----
  const [viewRange, setViewRange] = useState<{ top: number; bottom: number }>(
    () => ({
      top: 0,
      bottom: typeof window === 'undefined' ? 2000 : window.innerHeight,
    })
  );

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement;
    const top = Math.floor(el.scrollTop / SCROLL_BUCKET) * SCROLL_BUCKET;
    const bottom =
      Math.ceil((el.scrollTop + el.clientHeight) / SCROLL_BUCKET) *
      SCROLL_BUCKET;
    setViewRange(prev =>
      prev.top === top && prev.bottom === bottom ? prev : { top, bottom }
    );
  }, []);

  // measured card heights, keyed by `${docId}:${blockId}`
  const [heights, setHeights] = useState<Record<string, number>>({});
  const handleHeightChange = useCallback((key: string, height: number) => {
    setHeights(prev =>
      prev[key] === height ? prev : { ...prev, [key]: height }
    );
  }, []);

  const layout = useMemo(
    () =>
      computeGraphicalTimelineLayout(entries, {
        zoomLevel,
        hideEmptyPeriods,
        heights,
        groups: entryGroups,
        dayMarkerGap: 56,
      }),
    [entries, zoomLevel, hideEmptyPeriods, heights, entryGroups]
  );

  // ---- multi-select state ----
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const lastSelectedRef = useRef<string | null>(null);

  const handleSelectClick = useCallback(
    (key: string, mods: { ctrlKey: boolean; shiftKey: boolean }) => {
      setSelected(prev => {
        if (mods.shiftKey && lastSelectedRef.current) {
          // select the chronological range between the anchor and this card
          const next = new Set(prev);
          const keys = layout.nodes.map(n => entryKey(n.entry));
          const from = keys.indexOf(lastSelectedRef.current);
          const to = keys.indexOf(key);
          if (from !== -1 && to !== -1) {
            for (let i = Math.min(from, to); i <= Math.max(from, to); i++) {
              next.add(keys[i]);
            }
            return next;
          }
        }
        if (mods.ctrlKey) {
          // toggle non-consecutive selection
          const next = new Set(prev);
          if (next.has(key)) {
            next.delete(key);
          } else {
            next.add(key);
          }
          lastSelectedRef.current = key;
          return next;
        }
        // plain click: select only this card (click again to deselect)
        lastSelectedRef.current = key;
        if (prev.size === 1 && prev.has(key)) {
          return new Set<string>();
        }
        return new Set([key]);
      });
    },
    [layout.nodes]
  );

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    lastSelectedRef.current = null;
  }, []);

  // ---- marquee (drag selection box) ----
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);
  const marqueeStartRef = useRef<{
    x: number;
    y: number;
    additive: boolean;
    base: ReadonlySet<string>;
  } | null>(null);

  const containerPoint = useCallback((e: React.PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const handleContainerPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      // React propagates portal events (e.g. context menu items) up the
      // React tree even though they are outside the container in the DOM;
      // starting a marquee there would capture the pointer and swallow the
      // menu item's click
      if (!containerRef.current?.contains(e.target as Node)) return;
      // only start a marquee on empty space, not on cards
      if (
        (e.target as HTMLElement).closest(
          '[data-testid="graphical-timeline-card"]'
        )
      ) {
        return;
      }
      const { x, y } = containerPoint(e);
      marqueeStartRef.current = {
        x,
        y,
        additive: e.ctrlKey || e.metaKey,
        base: e.ctrlKey || e.metaKey ? selected : new Set(),
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [containerPoint, selected]
  );

  const handleContainerPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const start = marqueeStartRef.current;
      if (!start) return;
      const { x, y } = containerPoint(e);
      const rect: MarqueeRect = {
        x: Math.min(start.x, x),
        y: Math.min(start.y, y),
        width: Math.abs(x - start.x),
        height: Math.abs(y - start.y),
      };
      setMarquee(rect);

      // hit-test cards against the marquee in client coordinates
      const container = containerRef.current;
      if (!container) return;
      const containerRect = container.getBoundingClientRect();
      const boxLeft = containerRect.left + rect.x;
      const boxTop = containerRect.top + rect.y;
      const boxRight = boxLeft + rect.width;
      const boxBottom = boxTop + rect.height;

      const next = new Set(start.base);
      const cards = container.querySelectorAll<HTMLElement>('[data-key]');
      for (const card of cards) {
        const cardRect = card.getBoundingClientRect();
        const intersects =
          cardRect.left < boxRight &&
          cardRect.right > boxLeft &&
          cardRect.top < boxBottom &&
          cardRect.bottom > boxTop;
        if (intersects) {
          const key = card.dataset.key;
          if (key) next.add(key);
        }
      }
      setSelected(next);
    },
    [containerPoint]
  );

  const handleContainerPointerUp = useCallback(() => {
    const start = marqueeStartRef.current;
    marqueeStartRef.current = null;
    if (start && marquee === null) {
      // plain click on empty space clears the selection
      clearSelection();
    }
    setMarquee(null);
  }, [marquee, clearSelection]);

  // ---- selection actions ----
  const selectedKeys = useMemo(() => [...selected], [selected]);
  const selectedKeysRef = useRef(selectedKeys);
  selectedKeysRef.current = selectedKeys;

  const expandMergedKeys = useCallback(
    (keys: string[]) => {
      // group/merge definitions operate on source entry keys, so expand any
      // selected merged card back into its member keys
      const result: string[] = [];
      for (const key of keys) {
        const entry = entries.find(e => entryKey(e) === key);
        if (entry?.mergedEntries) {
          result.push(...entry.mergedEntries.map(entryKey));
        } else {
          result.push(key);
        }
      }
      return result;
    },
    [entries]
  );

  const handleGroup = useCallback(() => {
    setting.createGroup(expandMergedKeys(selectedKeysRef.current));
    clearSelection();
  }, [setting, expandMergedKeys, clearSelection]);

  const handleMerge = useCallback(() => {
    setting.createMerge(expandMergedKeys(selectedKeysRef.current));
    clearSelection();
  }, [setting, expandMergedKeys, clearSelection]);

  // only elements near the viewport are mounted
  const renderTop = viewRange.top - OVERSCAN;
  const renderBottom = viewRange.bottom + OVERSCAN;
  const inRange = useCallback(
    (y: number, height = 0) => y + height >= renderTop && y <= renderBottom,
    [renderTop, renderBottom]
  );

  const visibleNodes = useMemo(
    () =>
      layout.nodes.filter(node => {
        const key = entryKey(node.entry);
        const top = Math.min(node.axisY, node.cardY - 12);
        const height =
          Math.max(0, node.cardY - node.axisY) +
          (heights[key] ?? ESTIMATED_CARD_HEIGHT);
        return inRange(top, height);
      }),
    [layout.nodes, heights, inRange]
  );

  const isEmpty = entries.length === 0 && olderCount === 0;

  if (isEmpty) {
    return (
      <div className={pageStyles.emptyContainer}>
        <Empty description={t['com.affine.timeline.empty']()} />
      </div>
    );
  }

  return (
    <div className={styles.viewWrapper} onScroll={handleScroll}>
      <ScrollableContainer className={pageStyles.scrollArea}>
        <div
          ref={containerRef}
          className={styles.container}
          style={{ height: layout.totalHeight }}
          data-testid="graphical-timeline"
          onPointerDown={handleContainerPointerDown}
          onPointerMove={handleContainerPointerMove}
          onPointerUp={handleContainerPointerUp}
        >
          <div className={styles.axisLine} />
          {layout.ticks
            .filter(tick => inRange(tick.y))
            .map(tick => (
              <div
                key={tick.time}
                className={styles.tick}
                style={{ top: tick.y }}
              >
                <div className={styles.tickDot} />
                <span
                  className={[
                    styles.tickLabel,
                    tick.major ? styles.tickLabelMajor : '',
                  ].join(' ')}
                >
                  {tick.label}
                </span>
              </div>
            ))}
          {layout.gaps
            .filter(gap => inRange(gap.y))
            .map(gap => {
              const duration = formatGapDuration(gap.startTime, gap.endTime);
              const label = t.t('com.affine.timeline.graphical.gap', {
                duration,
              });
              return (
                <div
                  key={`${gap.startTime}-${gap.endTime}`}
                  className={styles.gapMarker}
                  style={{ top: gap.y }}
                >
                  {label}
                </div>
              );
            })}
          {layout.dayMarkers
            .filter(marker => inRange(marker.y))
            .map(marker => (
              <div
                key={`day-${marker.time}`}
                className={styles.dayMarker}
                style={{ top: marker.y }}
                data-testid="graphical-timeline-day-marker"
              >
                {dayjs(marker.time).format('dddd, D MMMM YYYY')}
              </div>
            ))}
          {visibleNodes.map(node => {
            const key = entryKey(node.entry);
            return (
              <GraphicalTimelineNode
                key={key}
                node={node}
                layout={layout}
                zoomLevel={zoomLevel}
                selected={selected.has(key)}
                selectedKeys={selectedKeys}
                onSelectClick={handleSelectClick}
                onGroupSelection={handleGroup}
                onMergeSelection={handleMerge}
                onHeightChange={handleHeightChange}
              />
            );
          })}
          {marquee ? (
            <div
              className={styles.marquee}
              style={{
                left: marquee.x,
                top: marquee.y,
                width: marquee.width,
                height: marquee.height,
              }}
              data-testid="graphical-timeline-marquee"
            />
          ) : null}
        </div>
        <LoadOlderRow />
      </ScrollableContainer>
      {selected.size >= 2 ? (
        <div
          className={styles.selectionToolbar}
          data-testid="graphical-timeline-selection-toolbar"
        >
          <span className={styles.selectionCount}>
            {t.t('com.affine.timeline.selection.count', {
              count: String(selected.size),
            })}
          </span>
          <Button variant="primary" onClick={handleGroup}>
            {t['com.affine.timeline.selection.group']()}
          </Button>
          <Button onClick={handleMerge}>
            {t['com.affine.timeline.selection.merge']()}
          </Button>
          <Button variant="plain" onClick={clearSelection}>
            {t['com.affine.timeline.selection.clear']()}
          </Button>
        </div>
      ) : null}
    </div>
  );
};
