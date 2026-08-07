import type {
  TimelineEntry,
  TimelineZoomLevel,
} from '../../../../../modules/timeline';

export interface TimelineAxisTick {
  y: number;
  time: number;
  label: string;
  major: boolean;
}

export interface TimelineGapMarker {
  y: number;
  startTime: number;
  endTime: number;
}

/** A calendar-day divider placed before the first entry of that day. */
export interface TimelineDayMarker {
  y: number;
  time: number;
}

export interface TimelineNodeLayout {
  entry: TimelineEntry;
  side: 'left' | 'right';
  /** Whether this node spans a period between axisY and axisEndY. */
  isPeriod: boolean;
  /** Vertical position of the dot / block start on the centerline. */
  axisY: number;
  /** For periods, vertical position of the block end on the centerline. */
  axisEndY?: number;
  /** Vertical position of the top of the card. */
  cardY: number;
  /** Set when the entry belongs to a fixed group. */
  groupId?: string;
}

export interface TimelineAnchor {
  time: number;
  y: number;
}

export interface GraphicalTimelineLayout {
  nodes: TimelineNodeLayout[];
  ticks: TimelineAxisTick[];
  gaps: TimelineGapMarker[];
  dayMarkers: TimelineDayMarker[];
  /** Chronological (time, y) anchor points, used to invert y back to time. */
  anchors: TimelineAnchor[];
  totalHeight: number;
}

export interface LayoutOptions {
  zoomLevel: TimelineZoomLevel;
  hideEmptyPeriods: boolean;
  /**
   * Measured card heights in px, keyed by `${docId}:${blockId}`.
   * Entries without a measurement fall back to `estimatedHeight`.
   */
  heights?: Record<string, number>;
  /** Fallback height for cards that have not been measured yet. */
  estimatedHeight?: number;
  /** px per unit (hour/minute/second) of real elapsed time, before capping. */
  pxPerUnit?: number;
  /** Maximum px a single time gap may occupy (keeps the scale content-driven). */
  maxGapPx?: number;
  /** Minimum vertical gap between two consecutive dots on the axis. */
  minDotGap?: number;
  /** Vertical gap between two cards stacked on the same side. */
  cardSpacing?: number;
  /** Padding above the first node and below the last node. */
  padding?: number;
  /** When hiding empty periods, gaps larger than this many units collapse. */
  maxVisibleGapUnits?: number;
  /** Fixed pixel height used to represent a collapsed gap. */
  collapsedGapPx?: number;
  /** Minimum px between two rendered axis ticks. */
  minTickSpacing?: number;
  /**
   * Sets of entries fixed together: members are laid out contiguously on
   * the same side with reduced spacing, and no other entry is placed on
   * that side within the group's vertical range.
   */
  groups?: { id: string; entryKeys: string[] }[];
  /** Vertical gap between two cards inside a fixed group. */
  groupSpacing?: number;
  /** Extra vertical space reserved before the first entry of a new day. */
  dayMarkerGap?: number;
  /**
   * Override the default alternating card side for an entry. Used for
   * conversation/chat layouts where the side is determined by sender (tag).
   */
  sideForEntry?: (entry: TimelineEntry) => 'left' | 'right' | undefined;
}

export const UNIT_MS: Record<TimelineZoomLevel, number> = {
  hour: 3_600_000,
  minute: 60_000,
  second: 1_000,
};

const DEFAULTS = {
  estimatedHeight: 64,
  pxPerUnit: 40,
  maxGapPx: 80,
  minDotGap: 24,
  cardSpacing: 16,
  padding: 40,
  maxVisibleGapUnits: 2,
  collapsedGapPx: 48,
  minTickSpacing: 28,
  groupSpacing: 8,
};

export function entryKey(entry: TimelineEntry): string {
  return `${entry.docId}:${entry.blockId}`;
}

function formatTickLabel(time: number, zoomLevel: TimelineZoomLevel): string {
  const date = new Date(time);
  if (zoomLevel === 'second') {
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Content-driven layout for the graphical timeline.
 *
 * Instead of a fixed px-per-minute scale, the vertical distance between two
 * consecutive entries is driven primarily by the content height of the card
 * in between, with a time-proportional component (capped at `maxGapPx`) so
 * that larger time gaps still read as larger spaces. Axis ticks (at the
 * current zoom unit) are interpolated between entry anchors, so the
 * effective px-per-minute varies with content density.
 *
 * When `hideEmptyPeriods` is on, gaps longer than `maxVisibleGapUnits` are
 * replaced by a fixed-height collapsed gap marker.
 */
export function computeGraphicalTimelineLayout(
  entries: TimelineEntry[],
  options: LayoutOptions
): GraphicalTimelineLayout {
  const estimatedHeight = options.estimatedHeight ?? DEFAULTS.estimatedHeight;
  const pxPerUnit = options.pxPerUnit ?? DEFAULTS.pxPerUnit;
  const maxGapPx = options.maxGapPx ?? DEFAULTS.maxGapPx;
  const minDotGap = options.minDotGap ?? DEFAULTS.minDotGap;
  const cardSpacing = options.cardSpacing ?? DEFAULTS.cardSpacing;
  const padding = options.padding ?? DEFAULTS.padding;
  const maxVisibleGapUnits =
    options.maxVisibleGapUnits ?? DEFAULTS.maxVisibleGapUnits;
  const collapsedGapPx = options.collapsedGapPx ?? DEFAULTS.collapsedGapPx;
  const minTickSpacing = options.minTickSpacing ?? DEFAULTS.minTickSpacing;
  const heights = options.heights ?? {};

  if (entries.length === 0) {
    return {
      nodes: [],
      ticks: [],
      gaps: [],
      dayMarkers: [],
      anchors: [],
      totalHeight: padding * 2,
    };
  }

  const unitMs = UNIT_MS[options.zoomLevel];
  const pxPerMs = pxPerUnit / unitMs;
  const maxGapMs = maxVisibleGapUnits * unitMs;

  const groupSpacing = options.groupSpacing ?? DEFAULTS.groupSpacing;
  const dayMarkerGap = options.dayMarkerGap ?? 0;

  const sorted = [...entries].sort(
    (a, b) => a.displayInTimelineAt - b.displayInTimelineAt
  );

  const heightOf = (entry: TimelineEntry) =>
    heights[entryKey(entry)] ?? estimatedHeight;

  // Partition entries into layout items: fixed groups (laid out as one
  // contiguous unit) and singles. Groups with fewer than two present
  // members degrade to singles.
  const groupIdByKey = new Map<string, string>();
  for (const group of options.groups ?? []) {
    for (const key of group.entryKeys) {
      groupIdByKey.set(key, group.id);
    }
  }
  const groupMembers = new Map<string, TimelineEntry[]>();
  const singleEntries: TimelineEntry[] = [];
  for (const entry of sorted) {
    const groupId = groupIdByKey.get(entryKey(entry));
    if (groupId) {
      const members = groupMembers.get(groupId) ?? [];
      members.push(entry);
      groupMembers.set(groupId, members);
    } else {
      singleEntries.push(entry);
    }
  }

  type LayoutItem =
    | { kind: 'single'; entry: TimelineEntry; time: number; endTime?: number }
    | {
        kind: 'group';
        id: string;
        members: TimelineEntry[];
        time: number;
        endTime?: number;
      };

  const items: LayoutItem[] = singleEntries.map(entry => ({
    kind: 'single' as const,
    entry,
    time: entry.displayInTimelineAt,
    endTime: entry.displayInTimelineEndAt,
  }));
  for (const [id, members] of groupMembers) {
    if (members.length < 2) {
      for (const entry of members) {
        items.push({
          kind: 'single',
          entry,
          time: entry.displayInTimelineAt,
          endTime: entry.displayInTimelineEndAt,
        });
      }
    } else {
      items.push({
        kind: 'group',
        id,
        members,
        time: members[0].displayInTimelineAt,
        endTime: undefined,
      });
    }
  }
  items.sort((a, b) => a.time - b.time);

  const nodes: TimelineNodeLayout[] = [];
  const gaps: TimelineGapMarker[] = [];
  const dayMarkers: TimelineDayMarker[] = [];
  const anchors: TimelineAnchor[] = [];
  const lastBottomBySide: Record<'left' | 'right', number> = {
    left: -Infinity,
    right: -Infinity,
  };
  const groupRanges: {
    side: 'left' | 'right';
    top: number;
    bottom: number;
  }[] = [];

  let prevAxisY = padding - minDotGap;
  let prevTime: number | null = null;
  let prevDay: string | null = null;

  const dayOf = (time: number) => new Date(time).toDateString();

  // reserves space for a day divider above the leading dot of a new day
  const applyDayMarker = (time: number, axisY: number): number => {
    const day = dayOf(time);
    if (day === prevDay) return axisY;
    const adjustedY = prevDay === null ? axisY : axisY + dayMarkerGap;
    dayMarkers.push({
      y: adjustedY - (dayMarkerGap > 0 ? dayMarkerGap / 2 : 20),
      time,
    });
    prevDay = day;
    return adjustedY;
  };

  const opposite = (side: 'left' | 'right') =>
    side === 'left' ? 'right' : 'left';

  // Positions an item's leading dot using the time-proportional gap capped
  // at maxGapPx, respecting the content already stacked on `side`.
  const placeLeading = (
    time: number,
    side: 'left' | 'right'
  ): { axisY: number; collapsed: boolean } => {
    if (prevTime === null) {
      return { axisY: padding, collapsed: false };
    }
    const timeDelta = time - prevTime;
    const collapsed = options.hideEmptyPeriods && timeDelta > maxGapMs;
    const timeGapPx = collapsed
      ? collapsedGapPx
      : Math.min(timeDelta * pxPerMs, maxGapPx);
    const contentMinY = lastBottomBySide[side] + cardSpacing;
    return {
      axisY: Math.max(prevAxisY + Math.max(timeGapPx, minDotGap), contentMinY),
      collapsed,
    };
  };

  // Positions the end of a period relative to its start using a
  // time-proportional scale with a small minimum so very short periods
  // remain visible. Periods are not capped so the block spans the full
  // duration on the timeline.
  const placeEnd = (startY: number, startTime: number, endTime: number) => {
    if (endTime <= startTime) return startY;
    const timeDelta = endTime - startTime;
    const gap = Math.max(timeDelta * pxPerMs, minDotGap);
    return startY + gap;
  };

  const commit = (
    entry: TimelineEntry,
    side: 'left' | 'right',
    axisY: number,
    cardY: number,
    isPeriod: boolean,
    axisEndY: number | undefined,
    groupId?: string
  ) => {
    nodes.push({
      entry,
      side,
      isPeriod,
      axisY,
      axisEndY,
      cardY,
      groupId,
    });
    anchors.push({ time: entry.displayInTimelineAt, y: axisY });
    lastBottomBySide[side] = cardY + heightOf(entry);
    prevAxisY = axisY;
    prevTime = entry.displayInTimelineAt;
  };

  const markCollapsed = (from: number, to: number, time: number) => {
    if (prevTime === null) return;
    gaps.push({
      y: from + (to - from) / 2,
      startTime: prevTime,
      endTime: time,
    });
  };

  items.forEach((item, index) => {
    const entryForSide = item.kind === 'single' ? item.entry : item.members[0];
    let side: 'left' | 'right' =
      options.sideForEntry?.(entryForSide) ??
      (index % 2 === 0 ? 'left' : 'right');

    if (item.kind === 'single') {
      const endTime = item.endTime;
      const isPeriod = endTime != null && endTime > item.time;
      let placed = placeLeading(item.time, side);
      // never interleave with a fixed group: if this entry lands inside a
      // group's vertical range on the same side, flip to the other side
      const conflict = groupRanges.find(
        range =>
          range.side === side &&
          placed.axisY >= range.top &&
          placed.axisY <= range.bottom
      );
      if (conflict) {
        side = opposite(side);
        placed = placeLeading(item.time, side);
      }
      const axisY = applyDayMarker(item.time, placed.axisY);
      if (placed.collapsed) {
        markCollapsed(prevAxisY, axisY, item.time);
      }
      const axisEndY = isPeriod
        ? placeEnd(axisY, item.time, endTime ?? item.time)
        : undefined;
      // Anchor the period card at the start; it can be dynamically offset
      // later if it overlaps a previous card on the same side.
      const cardY = axisY;
      commit(item.entry, side, axisY, cardY, isPeriod, axisEndY, undefined);
    } else {
      // fixed group: contiguous members on one side, reduced spacing
      const placed = placeLeading(item.time, side);
      const axisY = applyDayMarker(item.time, placed.axisY);
      if (placed.collapsed) {
        markCollapsed(prevAxisY, axisY, item.time);
      }
      const top = axisY;
      commit(item.members[0], side, axisY, axisY, false, undefined, item.id);
      for (let i = 1; i < item.members.length; i++) {
        const memberY = lastBottomBySide[side] + groupSpacing;
        const member = item.members[i];
        const memberEnd = member.displayInTimelineEndAt;
        const memberPeriod =
          memberEnd != null && memberEnd > member.displayInTimelineAt;
        const memberAxisEnd = memberPeriod
          ? placeEnd(
              memberY,
              member.displayInTimelineAt,
              memberEnd ?? member.displayInTimelineAt
            )
          : undefined;
        commit(
          member,
          side,
          memberY,
          memberY,
          memberPeriod,
          memberAxisEnd,
          item.id
        );
      }
      groupRanges.push({
        side,
        top,
        bottom: lastBottomBySide[side],
      });
    }
  });

  const ticks = buildTicks(
    anchors,
    unitMs,
    options.zoomLevel,
    minTickSpacing,
    gaps
  );

  const maxBottom = Math.max(
    lastBottomBySide.left,
    lastBottomBySide.right,
    prevAxisY
  );

  return {
    nodes,
    ticks,
    gaps,
    dayMarkers,
    anchors,
    totalHeight: maxBottom + padding,
  };
}

/**
 * Interpolates axis ticks at zoom-unit boundaries between consecutive
 * anchors. Because anchor spacing is content-driven, the resulting ticks are
 * non-uniform: the px height of a minute stretches or shrinks with content.
 * Ticks that would render closer than `minTickSpacing` px are skipped, as
 * are ticks inside collapsed gaps.
 */
function buildTicks(
  anchors: TimelineAnchor[],
  unitMs: number,
  zoomLevel: TimelineZoomLevel,
  minTickSpacing: number,
  gaps: TimelineGapMarker[]
): TimelineAxisTick[] {
  const ticks: TimelineAxisTick[] = [];
  const collapsedRanges = gaps.map(g => [g.startTime, g.endTime] as const);
  const isCollapsed = (time: number) =>
    collapsedRanges.some(([s, e]) => time > s && time < e);

  let lastY = -Infinity;
  const pushTick = (time: number, y: number) => {
    if (y - lastY < minTickSpacing) return;
    ticks.push({
      y,
      time,
      label: formatTickLabel(time, zoomLevel),
      major: time % (unitMs * 6) === 0,
    });
    lastY = y;
  };

  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    const span = b.time - a.time;
    if (span <= 0) continue;
    const start = Math.ceil(a.time / unitMs) * unitMs;
    for (let time = start; time <= b.time; time += unitMs) {
      if (time < a.time || isCollapsed(time)) continue;
      const y = a.y + ((time - a.time) / span) * (b.y - a.y);
      pushTick(time, y);
    }
  }

  return ticks;
}

/**
 * Inverse of the layout mapping: converts a y position back to a timestamp
 * by interpolating between the anchors, extrapolating past the ends at the
 * default time scale. Used when a card is dragged vertically to a new
 * position. `excludeKey` removes the dragged entry's own anchor so it does
 * not pin itself in place.
 */
export function yToTime(
  layout: GraphicalTimelineLayout,
  y: number,
  zoomLevel: TimelineZoomLevel,
  excludeKey?: string
): number {
  const unitMs = UNIT_MS[zoomLevel];
  const msPerPx = unitMs / DEFAULTS.pxPerUnit;

  const anchors = excludeKey
    ? layout.nodes
        .filter(n => entryKey(n.entry) !== excludeKey)
        .map(n => ({ time: n.entry.displayInTimelineAt, y: n.axisY }))
    : layout.anchors;

  if (anchors.length === 0) {
    return Date.now();
  }

  const first = anchors[0];
  const last = anchors[anchors.length - 1];

  if (y <= first.y) {
    return Math.round(first.time - (first.y - y) * msPerPx);
  }
  if (y >= last.y) {
    return Math.round(last.time + (y - last.y) * msPerPx);
  }

  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (y >= a.y && y <= b.y) {
      const span = b.y - a.y;
      if (span <= 0) return a.time;
      const progress = (y - a.y) / span;
      return Math.round(a.time + progress * (b.time - a.time));
    }
  }

  return last.time;
}
