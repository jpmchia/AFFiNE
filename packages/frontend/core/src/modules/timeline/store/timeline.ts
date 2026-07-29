import type { BlockModel } from '@blocksuite/affine/store';
import { LiveData, Store } from '@toeverything/infra';
import {
  combineLatest,
  debounceTime,
  map,
  Observable,
  of,
  switchMap,
} from 'rxjs';
import type { Transaction } from 'yjs';

import type { DocsService } from '../../doc';
import type { TimelineDisplayAtSource, TimelineEntry } from '../type';
import { getBlockExcerpt } from '../utils/block-excerpt';
import type { TimelineSettingStore } from './setting';

function isTimelineSupported(model: BlockModel) {
  return model.keys.includes('meta:displayInTimelineAt');
}

export class TimelineStore extends Store {
  constructor(
    private readonly docsService: DocsService,
    private readonly settingStore: TimelineSettingStore
  ) {
    super();
  }

  includedDocIds$ = combineLatest([
    this.docsService.allNonTrashDocIds$(),
    LiveData.from(
      this.docsService.propertyValues$('includeInTimeline'),
      new Map<string, string | undefined>()
    ),
  ]).pipe(
    map(([nonTrashIds, values]) => {
      const nonTrash = new Set(nonTrashIds);
      const included: string[] = [];
      for (const [id, value] of values) {
        if (nonTrash.has(id) && value) {
          included.push(id);
        }
      }
      return included;
    })
  );

  /**
   * Walks a single doc's block tree, stamping `meta:displayInTimelineAt` on
   * any timeline-supported block that is still missing it. Never overwrites
   * an existing value.
   *
   * Used both as the eager backfill (called right when a doc is opted into
   * the timeline) and as the lazy safety net inside `collectDocEntries`
   * (covers blocks created while the flag/opt-in was off, or synced from
   * old clients).
   */
  backfillDoc(docId: string, defaultSource?: TimelineDisplayAtSource) {
    const source =
      defaultSource ??
      this.settingStore.getSettingKey('defaultDisplayAtSource') ??
      'createdAt';
    const { doc, release } = this.docsService.open(docId);
    try {
      const store = doc.blockSuiteDoc;
      const root = store.root;
      if (!root) return;

      const queue: BlockModel[] = [root];
      while (queue.length) {
        const block = queue.shift();
        if (!block) continue;
        if (block.children) {
          queue.push(...block.children);
        }
        if (block.flavour === 'affine:surface') continue;
        if (!isTimelineSupported(block)) continue;

        const props = block.props as Record<string, unknown>;
        if (props['meta:displayInTimelineAt'] != null) continue;

        const createdAt = props['meta:createdAt'] as number | undefined;
        const updatedAt = props['meta:updatedAt'] as number | undefined;
        const displayAt =
          (source === 'updatedAt' ? updatedAt : createdAt) ?? Date.now();
        store.withoutTransact(() => {
          props['meta:displayInTimelineAt'] = displayAt;
        });
      }
    } finally {
      release();
    }
  }

  /**
   * Directly updates the `meta:displayInTimelineAt` timestamp on a single
   * block, e.g. from an inline date editor in the timeline UI.
   */
  updateDisplayAt(docId: string, blockId: string, displayAt: number) {
    const { doc, release } = this.docsService.open(docId);
    try {
      const store = doc.blockSuiteDoc;
      const block = store.getBlock(blockId)?.model;
      if (!block) return;
      const props = block.props as Record<string, unknown>;
      store.withoutTransact(() => {
        props['meta:displayInTimelineAt'] = displayAt;
      });
    } finally {
      release();
    }
  }

  /**
   * Walks a single doc's block tree and collects timeline entries, applying
   * the lazy backfill safety net along the way.
   */
  private collectDocEntries(
    docId: string,
    defaultSource: TimelineDisplayAtSource
  ): TimelineEntry[] {
    this.backfillDoc(docId, defaultSource);

    const { doc, release } = this.docsService.open(docId);
    try {
      const store = doc.blockSuiteDoc;
      const root = store.root;
      if (!root) return [];

      const docTitle = doc.title$.value;
      const entries: TimelineEntry[] = [];
      const queue: BlockModel[] = [root];

      while (queue.length) {
        const block = queue.shift();
        if (!block) continue;
        if (block.children) {
          queue.push(...block.children);
        }
        if (block.flavour === 'affine:surface') continue;
        if (!isTimelineSupported(block)) continue;

        const props = block.props as Record<string, unknown>;
        const displayAt = props['meta:displayInTimelineAt'] as
          | number
          | undefined;
        if (displayAt == null) continue;

        entries.push({
          docId,
          docTitle,
          blockId: block.id,
          flavour: block.flavour,
          displayInTimelineAt: displayAt,
          excerpt: getBlockExcerpt(block),
        });
      }

      return entries;
    } finally {
      release();
    }
  }

  /**
   * Emits the full list of timeline entries, recomputed whenever the set of
   * included docs changes, or whenever any currently-included doc's content
   * changes (block added/edited/removed) while this observable is
   * subscribed.
   */
  watchEntries() {
    return this.includedDocIds$.pipe(
      debounceTime(50),
      switchMap(docIds => {
        if (docIds.length === 0) return of([] as TimelineEntry[]);

        return new Observable<TimelineEntry[]>(subscriber => {
          const defaultSource =
            this.settingStore.getSettingKey('defaultDisplayAtSource') ??
            'createdAt';

          const recompute = () => {
            const entries = docIds.flatMap(docId =>
              this.collectDocEntries(docId, defaultSource)
            );
            subscriber.next(entries);
          };

          const releases: (() => void)[] = [];
          const unsubscribes: (() => void)[] = [];

          for (const docId of docIds) {
            const { doc, release } = this.docsService.open(docId);
            releases.push(release);
            const handler = (trx: Transaction) => {
              if (trx.local) recompute();
            };
            doc.yDoc.on('afterTransaction', handler);
            unsubscribes.push(() => doc.yDoc.off('afterTransaction', handler));
          }

          recompute();

          return () => {
            unsubscribes.forEach(fn => fn());
            releases.forEach(fn => fn());
          };
        }).pipe(debounceTime(300));
      })
    );
  }
}
