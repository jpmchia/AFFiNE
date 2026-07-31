import type { AffineTextAttributes } from '@blocksuite/affine/shared/types';
import { type DeltaInsert, Text } from '@blocksuite/affine/store';
import { Service } from '@toeverything/infra';

import type { DocsService } from '../../doc';
import type { WorkspaceService } from '../../workspace';
import type { TimelineSetting } from '../entities/setting';
import {
  resolveMediaFile,
  type TimelineImportDataset,
  type TimelineImportLabelDef,
} from './schema';

export interface TimelineImportProgress {
  done: number;
  total: number;
}

export interface TimelineImportResult {
  docId: string;
  imported: number;
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
    onProgress?: (progress: TimelineImportProgress) => void
  ): Promise<TimelineImportResult> {
    const title =
      dataset.docTitle ??
      `Timeline import ${new Date().toISOString().slice(0, 10)}`;

    const docRecord = this.docsService.createDoc({
      docProps: { page: { title: new Text(title) } },
    });
    const docId = docRecord.id;

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

    // stable, chronological block order inside the doc
    const entries = [...dataset.entries].sort(
      (a, b) => a.displayAt - b.displayAt
    );
    const total = entries.length;
    let done = 0;

    const { doc, release } = this.docsService.open(docId);
    try {
      const store = doc.blockSuiteDoc;
      const root = store.root;
      if (!root) throw new Error('Imported doc has no root block');
      const note =
        root.children.find(child => child.flavour === 'affine:note') ??
        store.getBlock(store.addBlock('affine:note', {}, root.id))?.model;
      if (!note) throw new Error('Imported doc has no note block');

      for (const entry of entries) {
        const meta: Record<string, unknown> = {
          'meta:createdAt': entry.displayAt,
          'meta:updatedAt': entry.displayAt,
          'meta:displayInTimelineAt': entry.displayAt,
        };
        if (entry.endAt) {
          meta['meta:displayInTimelineEndAt'] = entry.endAt;
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
      release();
    }

    // opt the doc into the timeline (same property the doc panel toggles)
    docRecord.setProperty('includeInTimeline', true);

    // single settings write per tag / category batch
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
      docId,
      imported: dataset.entries.length - skipped.length,
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
