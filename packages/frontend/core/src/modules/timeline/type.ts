import type { TimelineBlockPreview } from './utils/block-excerpt';

export type { TimelineBlockPreview } from './utils/block-excerpt';

export type TimelineDisplayAtSource = 'createdAt' | 'updatedAt';
export type TimelineGrouping = 'day' | 'week' | 'month';
export type TimelineViewMode = 'list' | 'graphical';
export type TimelineZoomLevel = 'hour' | 'minute' | 'second';

/** A set of timeline entries fixed together (group) or merged into one. */
export interface TimelineEntrySet {
  id: string;
  /** Member entries as `${docId}:${blockId}` keys. */
  entryKeys: string[];
}

/** A user-defined colored label (used for both tags and categories). */
export interface TimelineLabel {
  id: string;
  name: string;
  color: string;
}

export interface TimelineSettings {
  defaultDisplayAtSource?: TimelineDisplayAtSource;
  grouping?: TimelineGrouping;
  sortDesc?: boolean;
  viewMode?: TimelineViewMode;
  zoomLevel?: TimelineZoomLevel;
  hideEmptyPeriods?: boolean;
  /** Entries hidden from the timeline, as `${docId}:${blockId}` keys. */
  hiddenEntries?: string[];
  /** Entries visually fixed together on the same side of the axis. */
  entryGroups?: TimelineEntrySet[];
  /** Entries merged into a single timeline card. */
  entryMerges?: TimelineEntrySet[];
  /** User-defined tags (multiple per entry). */
  tags?: TimelineLabel[];
  /** User-defined categories (one per entry). */
  categories?: TimelineLabel[];
  /** entryKey -> assigned tag ids. */
  entryTags?: Record<string, string[]>;
  /** entryKey -> assigned category id. */
  entryCategories?: Record<string, string>;
  /**
   * entryKey -> date/time prefix parsed from the content, hidden from the
   * content preview.
   */
  entryDatePrefixes?: Record<string, string>;
  /**
   * entryKey -> tag prefix parsed from the content, hidden from the
   * content preview.
   */
  entryTagPrefixes?: Record<string, string>;
  /**
   * How many months of entries to show initially (counting back from now).
   * 0 means no limit. Older entries stay loadable on demand.
   */
  initialLoadMonths?: number;
}

export interface TimelineEntry {
  docId: string;
  docTitle: string;
  blockId: string;
  flavour: string;
  displayInTimelineAt: number;
  excerpt: string;
  preview: TimelineBlockPreview;
}
