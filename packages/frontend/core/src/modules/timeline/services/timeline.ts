import { Service } from '@toeverything/infra';

import type { TimelineSetting } from '../entities/setting';
import type { Timeline } from '../entities/timeline';
import type { TimelineStore } from '../store/timeline';

export class TimelineService extends Service {
  constructor(
    private readonly store: TimelineStore,
    public readonly timeline: Timeline,
    public readonly setting: TimelineSetting
  ) {
    super();
  }

  /**
   * Eagerly stamps `meta:displayInTimelineAt` on all of a doc's existing
   * blocks. Call this right when a doc is opted into the timeline (doc
   * toggle, folder bulk-apply, or `createLink` inheritance).
   */
  backfillDoc(docId: string) {
    this.store.backfillDoc(docId);
  }
}
