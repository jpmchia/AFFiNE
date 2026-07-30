/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { getStoreManager } from '@affine/core/blocksuite/manager/store';
import { type Store as BlockSuiteStore, Text } from '@blocksuite/affine/store';
import { TestWorkspace } from '@blocksuite/affine/store/test';
import { Framework } from '@toeverything/infra';
import { firstValueFrom, of } from 'rxjs';
import { beforeEach, describe, expect, test } from 'vitest';

import { DocsService } from '../../doc';
import type { TimelineDisplayAtSource } from '../type';
import { TimelineSettingStore } from './setting';
import { TimelineStore } from './timeline';

const extensions = getStoreManager().config.init().value.get('store');

function createBlockSuiteDoc(docId: string) {
  const collection = new TestWorkspace({ id: `ws-${docId}` });
  collection.meta.initialize();
  const store = collection.createDoc(docId).getStore({ extensions });
  store.load();
  const pageBlockId = store.addBlock('affine:page', {
    title: new Text(docId),
  });
  const noteId = store.addBlock('affine:note', {}, pageBlockId);
  return { store, noteId };
}

function createTimelineStore(
  docStores: Map<string, BlockSuiteStore>,
  settings: { defaultDisplayAtSource?: TimelineDisplayAtSource } = {}
) {
  const framework = new Framework();
  const docIds = Array.from(docStores.keys());
  const fakeDocsService = {
    // eslint-disable-next-line rxjs/finnish
    allNonTrashDocIds$: () => of(docIds),
    // eslint-disable-next-line rxjs/finnish
    propertyValues$: () => of(new Map(docIds.map(id => [id, 'true'] as const))),
    open: (docId: string) => {
      const blockSuiteDoc = docStores.get(docId)!;
      return {
        doc: {
          blockSuiteDoc,
          yDoc: blockSuiteDoc.spaceDoc,
          // eslint-disable-next-line rxjs/finnish
          title$: { value: docId },
        },
        release: () => {},
      };
    },
  };
  const fakeSettingStore = {
    getSettingKey: (key: 'defaultDisplayAtSource') => settings[key],
  };
  framework
    .service(DocsService, fakeDocsService as unknown as DocsService)
    .store(
      TimelineSettingStore,
      fakeSettingStore as unknown as TimelineSettingStore
    )
    .store(TimelineStore, [DocsService, TimelineSettingStore]);
  return framework.provider().get(TimelineStore);
}

describe('TimelineStore', () => {
  let docA: ReturnType<typeof createBlockSuiteDoc>;

  beforeEach(() => {
    docA = createBlockSuiteDoc('doc-a');
  });

  test('backfillDoc stamps displayInTimelineAt from createdAt by default', () => {
    const id = docA.store.addBlock(
      'affine:paragraph',
      {
        text: new Text('Hello'),
        'meta:createdAt': 1000,
        'meta:updatedAt': 2000,
      },
      docA.noteId
    );
    const timelineStore = createTimelineStore(new Map([['doc-a', docA.store]]));
    timelineStore.backfillDoc('doc-a');
    const block = docA.store.getModelById(id)!;
    expect(block.props['meta:displayInTimelineAt' as never]).toBe(1000);
  });

  test('backfillDoc uses updatedAt when defaultDisplayAtSource is updatedAt', () => {
    const id = docA.store.addBlock(
      'affine:paragraph',
      {
        text: new Text('Hello'),
        'meta:createdAt': 1000,
        'meta:updatedAt': 2000,
      },
      docA.noteId
    );
    const timelineStore = createTimelineStore(
      new Map([['doc-a', docA.store]]),
      { defaultDisplayAtSource: 'updatedAt' }
    );
    timelineStore.backfillDoc('doc-a');
    const block = docA.store.getModelById(id)!;
    expect(block.props['meta:displayInTimelineAt' as never]).toBe(2000);
  });

  test('backfillDoc never overwrites an existing displayInTimelineAt', () => {
    const id = docA.store.addBlock(
      'affine:paragraph',
      {
        text: new Text('Hello'),
        'meta:createdAt': 1000,
        'meta:displayInTimelineAt': 555,
      },
      docA.noteId
    );
    const timelineStore = createTimelineStore(new Map([['doc-a', docA.store]]));
    timelineStore.backfillDoc('doc-a');
    const block = docA.store.getModelById(id)!;
    expect(block.props['meta:displayInTimelineAt' as never]).toBe(555);
  });

  test('updateDisplayAt sets the timestamp on the target block', () => {
    const id = docA.store.addBlock(
      'affine:paragraph',
      { text: new Text('Hello') },
      docA.noteId
    );
    const timelineStore = createTimelineStore(new Map([['doc-a', docA.store]]));
    timelineStore.updateDisplayAt('doc-a', id, 42);
    const block = docA.store.getModelById(id)!;
    expect(block.props['meta:displayInTimelineAt' as never]).toBe(42);
  });

  test('watchEntries emits entries with block-type-specific previews', async () => {
    docA.store.addBlock(
      'affine:paragraph',
      { text: new Text('Some notes'), 'meta:createdAt': 111 },
      docA.noteId
    );
    docA.store.addBlock(
      'affine:attachment',
      {
        name: 'report.pdf',
        size: 2048,
        type: 'application/pdf',
        'meta:createdAt': 222,
      },
      docA.noteId
    );
    const timelineStore = createTimelineStore(new Map([['doc-a', docA.store]]));
    const entries = await firstValueFrom(timelineStore.watchEntries());
    expect(entries).toHaveLength(2);
    const previews = entries.map(e => e.preview.kind).sort();
    expect(previews).toEqual(['attachment', 'text']);
    const attachmentEntry = entries.find(e => e.preview.kind === 'attachment');
    expect(attachmentEntry?.preview).toEqual({
      kind: 'attachment',
      name: 'report.pdf',
      size: 2048,
      type: 'application/pdf',
      sourceId: undefined,
    });
  });

  test('watchEntries skips empty text blocks by default', async () => {
    docA.store.addBlock(
      'affine:paragraph',
      { text: new Text('Has content'), 'meta:createdAt': 111 },
      docA.noteId
    );
    docA.store.addBlock(
      'affine:paragraph',
      { text: new Text(''), 'meta:createdAt': 222 },
      docA.noteId
    );
    docA.store.addBlock(
      'affine:paragraph',
      { text: new Text('   '), 'meta:createdAt': 333 },
      docA.noteId
    );
    const timelineStore = createTimelineStore(new Map([['doc-a', docA.store]]));
    const entries = await firstValueFrom(timelineStore.watchEntries());
    expect(entries).toHaveLength(1);
    expect(entries[0].excerpt).toBe('Has content');
  });
});
