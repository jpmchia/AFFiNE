/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { getStoreManager } from '@affine/core/blocksuite/manager/store';
import { type Store, Text } from '@blocksuite/affine/store';
import { TestWorkspace } from '@blocksuite/affine/store/test';
import { beforeEach, describe, expect, test } from 'vitest';

import {
  getBlockExcerpt,
  getBlockPreview,
  isEmptyTextBlock,
} from './block-excerpt';

let docCollection: TestWorkspace;
let store: Store;

const extensions = getStoreManager().config.init().value.get('store');

beforeEach(() => {
  docCollection = new TestWorkspace({ id: 'test' });
  docCollection.meta.initialize();
  store = docCollection.createDoc('page0').getStore({ extensions });
  store.load();
  const pageBlockId = store.addBlock('affine:page', { title: new Text('') });
  store.addBlock('affine:note', {}, pageBlockId);
});

function noteId() {
  return store.getModelsByFlavour('affine:note')[0].id;
}

describe('getBlockExcerpt', () => {
  test('extracts text content from a paragraph', () => {
    const id = store.addBlock(
      'affine:paragraph',
      { text: new Text('Hello world') },
      noteId()
    );
    const block = store.getModelById(id)!;
    expect(getBlockExcerpt(block)).toBe('Hello world');
  });

  test('falls back to the flavour name when there is no text', () => {
    const id = store.addBlock('affine:divider', {}, noteId());
    const block = store.getModelById(id)!;
    expect(getBlockExcerpt(block)).toBe('[divider]');
  });
});

describe('isEmptyTextBlock', () => {
  test('true for a paragraph with empty text', () => {
    const id = store.addBlock(
      'affine:paragraph',
      { text: new Text('') },
      noteId()
    );
    expect(isEmptyTextBlock(store.getModelById(id)!)).toBe(true);
  });

  test('true for a paragraph with whitespace-only text', () => {
    const id = store.addBlock(
      'affine:paragraph',
      { text: new Text('   ') },
      noteId()
    );
    expect(isEmptyTextBlock(store.getModelById(id)!)).toBe(true);
  });

  test('false for a paragraph with content', () => {
    const id = store.addBlock(
      'affine:paragraph',
      { text: new Text('Hello') },
      noteId()
    );
    expect(isEmptyTextBlock(store.getModelById(id)!)).toBe(false);
  });

  test('false for blocks without a text field (image)', () => {
    const id = store.addBlock('affine:image', { sourceId: 'blob-1' }, noteId());
    expect(isEmptyTextBlock(store.getModelById(id)!)).toBe(false);
  });
});

describe('getBlockPreview', () => {
  test('paragraph -> text preview', () => {
    const id = store.addBlock(
      'affine:paragraph',
      { text: new Text('Some notes') },
      noteId()
    );
    const preview = getBlockPreview(store.getModelById(id)!);
    expect(preview).toEqual({ kind: 'text', text: 'Some notes' });
  });

  test('list -> list preview carries type and checked state', () => {
    const id = store.addBlock(
      'affine:list',
      { text: new Text('Buy milk'), type: 'todo', checked: true },
      noteId()
    );
    const preview = getBlockPreview(store.getModelById(id)!);
    expect(preview).toEqual({
      kind: 'list',
      text: 'Buy milk',
      listType: 'todo',
      checked: true,
    });
  });

  test('code -> code preview carries language', () => {
    const id = store.addBlock(
      'affine:code',
      { text: new Text('const a = 1;'), language: 'typescript' },
      noteId()
    );
    const preview = getBlockPreview(store.getModelById(id)!);
    expect(preview).toEqual({
      kind: 'code',
      text: 'const a = 1;',
      language: 'typescript',
    });
  });

  test('callout -> callout preview carries emoji when icon is an emoji', () => {
    const id = store.addBlock(
      'affine:callout',
      {
        text: new Text('Heads up'),
        icon: { type: 'emoji', unicode: '⚠️' },
      },
      noteId()
    );
    const preview = getBlockPreview(store.getModelById(id)!);
    expect(preview).toEqual({
      kind: 'callout',
      text: 'Heads up',
      emoji: '⚠️',
    });
  });

  test('image -> image preview carries sourceId and caption', () => {
    const id = store.addBlock(
      'affine:image',
      { sourceId: 'blob-1', caption: 'A cat' },
      noteId()
    );
    const preview = getBlockPreview(store.getModelById(id)!);
    expect(preview).toEqual({
      kind: 'image',
      sourceId: 'blob-1',
      caption: 'A cat',
    });
  });

  test('attachment -> attachment preview carries name/size/type', () => {
    const id = store.addBlock(
      'affine:attachment',
      { name: 'report.pdf', size: 1024, type: 'application/pdf' },
      noteId()
    );
    const preview = getBlockPreview(store.getModelById(id)!);
    expect(preview).toEqual({
      kind: 'attachment',
      name: 'report.pdf',
      size: 1024,
      type: 'application/pdf',
      sourceId: undefined,
    });
  });

  test('bookmark -> bookmark preview carries url/title/description', () => {
    const id = store.addBlock(
      'affine:bookmark',
      {
        url: 'https://affine.pro',
        title: 'AFFiNE',
        description: 'A workspace',
      },
      noteId()
    );
    const preview = getBlockPreview(store.getModelById(id)!);
    expect(preview).toEqual({
      kind: 'bookmark',
      url: 'https://affine.pro',
      title: 'AFFiNE',
      description: 'A workspace',
      icon: null,
    });
  });

  test('table -> table preview counts rows and columns', () => {
    const id = store.addBlock(
      'affine:table',
      {
        rows: { r1: { rowId: 'r1', order: 'a0' } },
        columns: {
          c1: { columnId: 'c1', order: 'a0' },
          c2: { columnId: 'c2', order: 'a1' },
        },
      },
      noteId()
    );
    const preview = getBlockPreview(store.getModelById(id)!);
    expect(preview).toEqual({ kind: 'table', rowCount: 1, columnCount: 2 });
  });

  test('unrecognized block -> unknown preview falls back to excerpt', () => {
    const id = store.addBlock('affine:divider', {}, noteId());
    const preview = getBlockPreview(store.getModelById(id)!);
    expect(preview).toEqual({ kind: 'unknown', excerpt: '[divider]' });
  });
});
