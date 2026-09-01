import type { AffineTextAttributes } from '@blocksuite/affine/shared/types';
import {
  type BlockModel,
  type DeltaInsert,
  Text,
} from '@blocksuite/affine/store';
import { Service } from '@toeverything/infra';

import type { DocsService } from '../../doc';
import type { WorkspaceService } from '../../workspace';
import {
  TIMELINE_LABEL_COLORS,
  type TimelineSetting,
} from '../entities/setting';
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
  /** Overrides the dataset's target document title. */
  docTitle?: string;
  /**
   * Category name (existing or new) applied to imported entries that do not
   * define their own category.
   */
  category?: string;
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
function parseMarkdownToDeltas(
  markdown: string
): DeltaInsert<AffineTextAttributes>[] {
  const normalized = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const deltas: DeltaInsert<AffineTextAttributes>[] = [];
  const regex =
    /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3|\[([^\]]+)\]\(([^)]+)\)|(`)([^`]+)\7|(\n)/g;
  let last = 0;
  for (const match of normalized.matchAll(regex)) {
    if (match.index > last) {
      deltas.push({ insert: normalized.slice(last, match.index) });
    }
    if (match[2]) {
      deltas.push({ insert: match[2], attributes: { bold: true } });
    } else if (match[4]) {
      deltas.push({ insert: match[4], attributes: { italic: true } });
    } else if (match[5] !== undefined) {
      deltas.push({
        insert: match[5],
        attributes: { link: match[6] },
      });
    } else if (match[8]) {
      deltas.push({ insert: match[8], attributes: { code: true } });
    } else if (match[9]) {
      deltas.push({ insert: '\n' });
    }
    last = match.index + match[0].length;
  }
  if (last < normalized.length) {
    deltas.push({ insert: normalized.slice(last) });
  }
  return deltas;
}

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
    const fallbackCategory = options?.category?.trim() || undefined;
    const title =
      options?.docTitle?.trim() ||
      dataset.docTitle ||
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

    const { byName: tagIdByName, byColor: tagColorByName } = this.ensureLabels(
      'tag',
      dataset.tags,
      [...new Set(dataset.entries.flatMap(e => e.tags ?? []))]
    );
    const { byName: categoryIdByName } = this.ensureLabels(
      'category',
      dataset.categories,
      [
        ...new Set(
          [...dataset.entries.map(e => e.category), fallbackCategory].filter(
            (c): c is string => !!c
          )
        ),
      ]
    );

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
      newDoc = this.docsService.open(docRecord.id);
    }

    const store = newDoc?.doc.blockSuiteDoc;
    const root = store?.root;
    const note =
      root?.children.find(
        (child: BlockModel) => child.flavour === 'affine:note'
      ) ??
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

            const entryCategory = entry.category ?? fallbackCategory;
            const newCategoryId = entryCategory
              ? categoryIdByName.get(entryCategory.toLowerCase())
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
          'meta:displayInTimelineAt': entry.displayAt,
        };
        if (entry.endAt) {
          meta['meta:displayInTimelineEndAt'] = entry.endAt;
        }
        if (entry.color) {
          meta['meta:timelineColor'] = entry.color;
        }
        if (entry.title) {
          // Set later; only if the title is not the entire body text.
          meta['meta:timelineTitle'] = entry.title;
        }
        const blockIds: string[] = [];

        // Add a non-timeline header so the doc view shows date/time and sender.
        const dateTags = `${new Date(entry.displayAt).toLocaleString(
          undefined,
          {
            dateStyle: 'short',
            timeStyle: 'medium',
          }
        )}${entry.tags?.length ? ` — ${entry.tags.join(', ')}` : ''}`;
        const firstTag = entry.tags?.[0]?.toLowerCase();
        const tagColor = firstTag ? tagColorByName.get(firstTag) : undefined;
        const headerDeltas: DeltaInsert<AffineTextAttributes>[] = [];
        headerDeltas.push(
          tagColor
            ? { insert: dateTags, attributes: { color: tagColor } }
            : { insert: dateTags }
        );
        if (entry.title) {
          const titleAttributes: AffineTextAttributes = { bold: true };
          if (entry.color) titleAttributes.color = entry.color;
          headerDeltas.push(
            { insert: '\n' },
            { insert: entry.title, attributes: titleAttributes }
          );
        }
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
          const titlePrefix = entry.title ? `${entry.title}\n` : '';
          const hasContentPrefix =
            titlePrefix && entry.text.startsWith(titlePrefix);
          const body = hasContentPrefix
            ? entry.text.slice(titlePrefix.length)
            : entry.text;
          const isTitleOnly = entry.title && !hasContentPrefix;
          const isEmptyAfterTitle = hasContentPrefix && !body.trim();
          if (isTitleOnly || isEmptyAfterTitle) {
            // The title is the only text; show it as normal content.
            delete meta['meta:timelineTitle'];
          }
          const finalBody = isEmptyAfterTitle ? entry.text : body;
          blockIds.push(
            store.addBlock(
              'affine:paragraph',
              {
                text: new Text(parseMarkdownToDeltas(finalBody)),
                ...meta,
              },
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
          const entryCategory = entry.category ?? fallbackCategory;
          const categoryId = entryCategory
            ? categoryIdByName.get(entryCategory.toLowerCase())
            : undefined;
          if (categoryId) entryCategoryAssignments.set(entryKey, categoryId);
        }

        done += 1;
        onProgress?.({ done, total });
      }

      if (docRecord) {
        docRecord.setProperty('includeInTimeline', true);
      }
    } finally {
      newDoc?.release();
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
  ): { byName: Map<string, string>; byColor: Map<string, string | undefined> } {
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
    const byColor = new Map<string, string | undefined>();
    for (const label of known) {
      byName.set(label.name.toLowerCase(), label.id);
      if (label.color) byColor.set(label.name.toLowerCase(), label.color);
    }

    const wanted: TimelineImportLabelDef[] = [
      ...(defs ?? []),
      ...referencedNames.map(name => ({ name })),
    ];
    let nextColorIndex = known.length;
    for (const def of wanted) {
      const key = def.name.toLowerCase();
      let id = byName.get(key);
      let color = def.color;
      if (!id) {
        id = create(def.name);
        byName.set(key, id);
        if (!color) {
          color =
            TIMELINE_LABEL_COLORS[
              nextColorIndex % TIMELINE_LABEL_COLORS.length
            ];
          nextColorIndex++;
        }
        updateColor(id, color);
      } else if (color) {
        updateColor(id, color);
      }
      if (color || !byColor.has(key)) {
        byColor.set(key, color);
      }
    }
    return { byName, byColor };
  }
}
