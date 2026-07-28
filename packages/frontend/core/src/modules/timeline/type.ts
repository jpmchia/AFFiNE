export type TimelineDisplayAtSource = 'createdAt' | 'updatedAt';
export type TimelineGrouping = 'day' | 'week' | 'month';

export interface TimelineSettings {
  defaultDisplayAtSource?: TimelineDisplayAtSource;
  grouping?: TimelineGrouping;
  sortDesc?: boolean;
}

export interface TimelineEntry {
  docId: string;
  docTitle: string;
  blockId: string;
  flavour: string;
  displayInTimelineAt: number;
  excerpt: string;
}
