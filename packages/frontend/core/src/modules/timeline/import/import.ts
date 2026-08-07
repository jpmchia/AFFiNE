import type { AffineTextAttributes } from '@blocksuite/affine/shared/types';
import { type DeltaInsert, Text } from '@blocksuite/affine/store';
import { Service } from '@toeverything/infra';

import type { DocsService } from '../../doc';
import type { WorkspaceService } from '../../workspace';
import type { TimelineSetting } from '../entities/setting';
import type { TimelineEntry } from '../type';
import {
  resolveMediaFile,
  type TimelineImportDataset,
  type TimelineImportLabelDef,
} from './schema';

export interface TimelineImportProgress {
  done: number;
  total: number;
}

export type ImportMode = 'import' | 'skip' | 'update';

export interface TimelineImportOptions {
  mode?: ImportMode;
  /** Existing timeline entries to match against when mode is 'skip' or 'update'. */
  existing?: TimelineEntry[];
}

export interface TimelineImportResult {
  docId: string | null;
  imported: number;
  updated: number;
  /** Human-readable messages for entries that could not be imported. */
  skipped: string[];
}

/**
 * Imports a validated {@link TimelineImportDataset} into the current
 * workspace: creates a doc, appends one block per entry (paragraph, image or
 * attachment) stamped with `meta:displayInTimelineAt`, uploads media blobs,
 * opts the doc into the timeline and assigns tags/categories through the
 * timeline settings.
 */
export class TimelineImportService extends Service {
  constructor(
    private readonly docsService: DocsService,
    private readonly workspaceService: WorkspaceService,
    private readonly setting: TimelineSetting
  ) {
    super();
  }

  async importDataset(
    dataset: TimelineImportDataset,
    mediaFiles: Map<string, File>,
    options?: TimelineImportOptions,
    onProgress?: (progress: TimelineImportProgress) => void
  ): Promise<TimelineImportResult> {
    const mode = options?.mode ?? 'import';
    const existing = options?.existing ?? [];
    const title =
      dataset.docTitle ??
      `Timeline import ${new Date().toISOString().slice(0, 10)}`;

    const makeImportKey = (
      displayAt: number,
      endAt: number | undefined,
      content: string
    ) => [displayAt, endAt ?? '', content.slice(0, 150)].join('\0');

    const existingByKey = new Map<
      string,
      { docId: string; blockId: string; entryKey: string }
    >();
    if (mode !== 'import') {
      for (const e of existing) {
        const key = makeImportKey(
          e.displayInTimelineAt,
          e.displayInTimelineEndAt,
          e.excerpt
        );
        existingByKey.set(key, {
          docId: e.docId,
          blockId: e.blockId,
          entryKey: `${e.docId}:${e.blockId}`,
        });
      }
    }

    const tagIdByName = this.ensureLabels('tag', dataset.tags, [
      ...new Set(dataset.entries.flatMap(e => e.tags ?? [])),
    ]);
    const categoryIdByName = this.ensureLabels('category', dataset.categories, [
      ...new Set(
        dataset.entries.map(e => e.category).filter((c): c is string => !!c)
      ),
    ]);

    // Map tag name -> color for header styling.
    const allTags = this.setting.tags$.value ?? [];
    const tagColorById = new Map(allTags.map(t => [t.id, t.color] as const));
    const tagColorByName = new Map<string, string>();
    for (const [name, id] of tagIdByName) {
      const color = tagColorById.get(id);
      if (color) tagColorByName.set(name, color);
    }

    const skipped: string[] = [];
    const entryTagAssignments = new Map<string, string[]>();
    const entryCategoryAssignments = new Map<string, string>();
    const existingTagRemovals = new Map<string, string[]>();
    const existingTagAdditions = new Map<string, string[]>();
    const existingCategoryChanges = new Map<string, string[]>();
    const existingColorUpdates = new Map<
      string,
      { blockId: string; color: string }[]
    >();

    const currentEntryTags = this.setting.entryTags$.value ?? {};
    const currentEntryCategories = this.setting.entryCategories$.value ?? {};

    // stable, chronological block order inside the doc
    const entries = [...dataset.entries].sort(
      (a, b) => a.displayAt - b.displayAt
    );
    const total = entries.length;
    let done = 0;
    let imported = 0;
    let updated = 0;

    const hasNew = entries.some(entry => {
      const content = entry.text ?? entry.media ?? '';
      const key = makeImportKey(entry.displayAt, entry.endAt, content);
      return !existingByKey.has(key);
    });

    let docRecord: any;
    let docId: string | null = null;
    let newDoc: any;

    if (hasNew) {
      docRecord = this.docsService.createDoc({
        docProps: { page: { title: new Text(title) } },
      });
      docId = docRecord.id;
      newDoc = this.docsService.open(docId);
    }

    const store = newDoc?.doc.blockSuiteDoc;
    const root = store?.root;
    const note =
      root?.children.find(child => child.flavour === 'affine:note') ??
      (root && store
        ? store.getBlock(store.addBlock('affine:note', {}, root.id))?.model
        : undefined);
    if (hasNew && (!store || !root || !note)) {
      throw new Error('Imported doc has no note block');
    }

    try {
      for (const entry of entries) {
        const content = entry.text ?? entry.media ?? '';
        const key = makeImportKey(entry.displayAt, entry.endAt, content);
        const existingEntry =
          mode !== 'import' ? existingByKey.get(key) : undefined;

        if (existingEntry) {
          if (mode === 'skip') {
            skipped.push(
              `Skipped duplicate at ${new Date(entry.displayAt).toLocaleString()}`
            );
            done += 1;
            onProgress?.({ done, total });
            continue;
          }

          if (mode === 'update') {
            updated += 1;

            const newTagIds = (entry.tags ?? [])
              .map(name => tagIdByName.get(name.toLowerCase()))
              .filter((id): id is string => !!id);
            const oldTagIds = currentEntryTags[existingEntry.entryKey] ?? [];
            for (const old of oldTagIds) {
              if (!newTagIds.includes(old)) {
                const keys = existingTagRemovals.get(old) ?? [];
                keys.push(existingEntry.entryKey);
                existingTagRemovals.set(old, keys);
              }
            }
            for (const newId of newTagIds) {
              if (!oldTagIds.includes(newId)) {
                const keys = existingTagAdditions.get(newId) ?? [];
                keys.push(existingEntry.entryKey);
                existingTagAdditions.set(newId, keys);
              }
            }

            const newCategoryId = entry.category
              ? categoryIdByName.get(entry.category.toLowerCase())
              : undefined;
            const oldCategoryId =
              currentEntryCategories[existingEntry.entryKey];
            const categoryTarget =
              newCategoryId !== undefined ? newCategoryId : 'null';
            if (categoryTarget !== (oldCategoryId ?? 'null')) {
              const keys = existingCategoryChanges.get(categoryTarget) ?? [];
              keys.push(existingEntry.entryKey);
              existingCategoryChanges.set(categoryTarget, keys);
            }

            if (entry.color) {
              const list = existingColorUpdates.get(existingEntry.docId) ?? [];
              list.push({
                blockId: existingEntry.blockId,
                color: entry.color,
              });
              existingColorUpdates.set(existingEntry.docId, list);
            }

            done += 1;
            onProgress?.({ done, total });
            continue;
          }
        }

        if (!store || !note) {
          throw new Error('New doc not initialized for import');
        }
        imported += 1;

        const meta: Record<string, unknown> = {
          'meta:createdAt': entry.displayAt,
          'meta:updatedAt': entry.displayAt,
          'meta:displayInTimelineAt': entry.displayAt,
        };
        if (entry.endAt) {
          meta['meta:displayInTimelineEndAt'] = entry.endAt;
        }
        if (entry.color) {
          meta['meta:timelineColor'] = entry.color;
        }
        const blockIds: string[] = [];

        // Add a non-timeline header so the doc view shows date/time and sender.
        const header = `${new Date(entry.displayAt).toLocaleString(undefined, {
          dateStyle: 'short',
          timeStyle: 'medium',
        })}${entry.tags?.length ? ` — ${entry.tags.join(', ')}` : ''}`;
        const firstTag = entry.tags?.[0]?.toLowerCase();
        const tagColor = firstTag ? tagColorByName.get(firstTag) : undefined;
        const headerDeltas: DeltaInsert<AffineTextAttributes>[] = tagColor
          ? [{ insert: header, attributes: { color: tagColor } }]
          : [{ insert: header }];
        store.addBlock(
          'affine:paragraph',
          {
            text: new Text(headerDeltas),
            'meta:excludeFromTimeline': true,
          },
          note.id
        );

        if (entry.media) {
          const file = resolveMediaFile(entry.media, mediaFiles);
          if (!file) {
            skipped.push(`Media file not found: ${entry.media}`);
          } else {
            try {
              const sourceId =
                await this.workspaceService.workspace.docCollection.blobSync.set(
                  file
                );
              if (file.type.startsWith('image/')) {
                blockIds.push(
                  store.addBlock(
                    'affine:image',
                    { sourceId, size: file.size, ...meta },
                    note.id
                  )
                );
              } else {
                blockIds.push(
                  store.addBlock(
                    'affine:attachment',
                    {
                      name: file.name,
                      size: file.size,
                      type: file.type || 'application/octet-stream',
                      sourceId,
                      embed: false,
                      ...meta,
                    },
                    note.id
                  )
                );
              }
            } catch (error) {
              skipped.push(
                `Failed to upload ${entry.media}: ${
                  error instanceof Error ? error.message : 'unknown error'
                }`
              );
            }
          }
        }

        if (entry.text) {
          blockIds.push(
            store.addBlock(
              'affine:paragraph',
              { text: new Text(entry.text), ...meta },
              note.id
            )
          );
        }

        for (const blockId of blockIds) {
          const entryKey = `${docId}:${blockId}`;
          const tagIds = (entry.tags ?? [])
            .map(name => tagIdByName.get(name.toLowerCase()))
            .filter((id): id is string => !!id);
          if (tagIds.length) entryTagAssignments.set(entryKey, tagIds);
          const categoryId = entry.category
            ? categoryIdByName.get(entry.category.toLowerCase())
            : undefined;
          if (categoryId) entryCategoryAssignments.set(entryKey, categoryId);
        }

        done += 1;
        onProgress?.({ done, total });
      }
    } finally {
      newDoc?.release();
    }

    if (docRecord) {
      docRecord.setProperty('includeInTimeline', true);
    }

    for (const [docId, updates] of existingColorUpdates) {
      const { doc, release } = this.docsService.open(docId);
      try {
        const store = doc.blockSuiteDoc;
        store.withoutTransact(() => {
          for (const { blockId, color } of updates) {
            const block = store.getBlock(blockId)?.model;
            if (!block) continue;
            (block.props as Record<string, unknown>)['meta:timelineColor'] =
              color;
          }
        });
      } finally {
        release();
      }
    }

    for (const [tagId, keys] of existingTagRemovals) {
      this.setting.setEntryTagBatch(keys, tagId, false);
    }
    for (const [tagId, keys] of existingTagAdditions) {
      this.setting.setEntryTagBatch(keys, tagId, true);
    }
    for (const [categoryId, keys] of existingCategoryChanges) {
      this.setting.setEntryCategoryBatch(
        keys,
        categoryId === 'null' ? null : categoryId
      );
    }

    // single settings write per tag / category batch for new entries
    const byTag = new Map<string, string[]>();
    for (const [entryKey, tagIds] of entryTagAssignments) {
      for (const tagId of tagIds) {
        const keys = byTag.get(tagId) ?? [];
        keys.push(entryKey);
        byTag.set(tagId, keys);
      }
    }
    for (const [tagId, keys] of byTag) {
      this.setting.setEntryTagBatch(keys, tagId, true);
    }
    const byCategory = new Map<string, string[]>();
    for (const [entryKey, categoryId] of entryCategoryAssignments) {
      const keys = byCategory.get(categoryId) ?? [];
      keys.push(entryKey);
      byCategory.set(categoryId, keys);
    }
    for (const [categoryId, keys] of byCategory) {
      this.setting.setEntryCategoryBatch(keys, categoryId);
    }

    return {
      docId: docRecord?.id ?? null,
      imported,
      updated,
      skipped,
    };
  }

  /**
   * Resolves label names (from definitions plus names referenced by entries)
   * to ids, creating missing labels. Matching is case-insensitive.
   */
  private ensureLabels(
    kind: 'tag' | 'category',
    defs: TimelineImportLabelDef[] | undefined,
    referencedNames: string[]
  ): Map<string, string> {
    const known =
      kind === 'tag'
        ? (this.setting.tags$.value ?? [])
        : (this.setting.categories$.value ?? []);
    const create =
      kind === 'tag'
        ? (name: string) => this.setting.createTag(name)
        : (name: string) => this.setting.createCategory(name);
    const updateColor =
      kind === 'tag'
        ? (id: string, color: string) => this.setting.updateTag(id, { color })
        : (id: string, color: string) =>
            this.setting.updateCategory(id, { color });

    const byName = new Map<string, string>();
    for (const label of known) {
      byName.set(label.name.toLowerCase(), label.id);
    }

    const wanted: TimelineImportLabelDef[] = [
      ...(defs ?? []),
      ...referencedNames.map(name => ({ name })),
    ];
    for (const def of wanted) {
      const key = def.name.toLowerCase();
      let id = byName.get(key);
      if (!id) {
        id = create(def.name);
        byName.set(key, id);
      }
      if (def.color) {
        updateColor(id, def.color);
      }
    }
    return byName;
  }
}
