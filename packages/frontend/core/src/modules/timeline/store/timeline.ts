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
import {
  getBlockExcerpt,
  getBlockPreview,
  isEmptyTextBlock,
} from '../utils/block-excerpt';
import type { TimelineSettingStore } from './setting';

function isTimelineSupported(model: BlockModel) {
  if (!model.keys.includes('meta:displayInTimelineAt')) return false;
  const props = model.props as Record<string, unknown>;
  return !props['meta:excludeFromTimeline'];
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
    this.updateDisplayAtBatch([{ docId, blockId, displayAt }]);
  }

  /**
   * Applies many `meta:displayInTimelineAt` updates with a single yjs
   * transaction per doc, so watchers recompute once instead of per block.
   */
  updateDisplayAtBatch(
    updates: { docId: string; blockId: string; displayAt: number }[]
  ) {
    const byDoc = new Map<string, { blockId: string; displayAt: number }[]>();
    for (const update of updates) {
      const docUpdates = byDoc.get(update.docId) ?? [];
      docUpdates.push(update);
      byDoc.set(update.docId, docUpdates);
    }
    for (const [docId, docUpdates] of byDoc) {
      const { doc, release } = this.docsService.open(docId);
      try {
        const store = doc.blockSuiteDoc;
        store.withoutTransact(() => {
          for (const { blockId, displayAt } of docUpdates) {
            const block = store.getBlock(blockId)?.model;
            if (!block) continue;
            (block.props as Record<string, unknown>)[
              'meta:displayInTimelineAt'
            ] = displayAt;
          }
        });
      } finally {
        release();
      }
    }
  }

  /**
   * Walks a single doc's block tree and collects timeline entries, applying
   * the lazy backfill safety net along the way.
   */
  private collectDocEntries(
    docId: string,
    defaultSource: TimelineDisplayAtSource,
    backfill: boolean
  ): TimelineEntry[] {
    if (backfill) {
      this.backfillDoc(docId, defaultSource);
    }

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
        if (isEmptyTextBlock(block)) continue;

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
          preview: getBlockPreview(block),
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

          // per-doc entry cache: only docs whose yDoc actually changed are
          // re-walked; the rest reuse their cached entries
          const cache = new Map<string, TimelineEntry[]>();
          const dirty = new Set<string>(docIds);

          // the backfill safety net only needs to run once per subscription;
          // afterwards recomputes skip the extra tree walk
          let backfilled = false;
          const recompute = () => {
            for (const docId of dirty) {
              cache.set(
                docId,
                this.collectDocEntries(docId, defaultSource, !backfilled)
              );
            }
            dirty.clear();
            backfilled = true;
            subscriber.next(docIds.flatMap(docId => cache.get(docId) ?? []));
          };

          // coalesce bursts of transactions (typing, batched updates) into a
          // single recompute instead of one full re-collect per transaction
          let recomputeTimer: ReturnType<typeof setTimeout> | null = null;
          const scheduleRecompute = () => {
            if (recomputeTimer !== null) clearTimeout(recomputeTimer);
            recomputeTimer = setTimeout(() => {
              recomputeTimer = null;
              recompute();
            }, 150);
          };

          const releases: (() => void)[] = [];
          const unsubscribes: (() => void)[] = [];

          for (const docId of docIds) {
            const { doc, release } = this.docsService.open(docId);
            releases.push(release);
            const handler = (trx: Transaction) => {
              if (trx.local) {
                dirty.add(docId);
                scheduleRecompute();
              }
            };
            doc.yDoc.on('afterTransaction', handler);
            unsubscribes.push(() => doc.yDoc.off('afterTransaction', handler));
          }

          recompute();

          return () => {
            if (recomputeTimer !== null) clearTimeout(recomputeTimer);
            unsubscribes.forEach(fn => fn());
            releases.forEach(fn => fn());
          };
        });
      })
    );
  }
}
