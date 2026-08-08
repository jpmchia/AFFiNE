import { Entity } from '@toeverything/infra';
import { nanoid } from 'nanoid';

import type { TimelineSettingStore } from '../store/setting';
import type {
  TimelineDisplayAtSource,
  TimelineEntrySet,
  TimelineGrouping,
  TimelineViewMode,
  TimelineZoomLevel,
} from '../type';

const ZOOM_LEVELS: TimelineZoomLevel[] = ['hour', 'minute', 'second'];

/** Default palette cycled through when creating new tags/categories. */
export const TIMELINE_LABEL_COLORS = [
  '#F5A623',
  '#7ED321',
  '#1FB6B0',
  '#4A90D9',
  '#9013FE',
  '#E91E63',
  '#FF6B6B',
  '#795548',
];

function newId(prefix: string) {
  return `${prefix}-${nanoid()}`;
}

/**
 * Removes the given keys from every set, dropping sets left with fewer than
 * two members.
 */
function removeKeysFromSets(
  sets: TimelineEntrySet[],
  keys: string[]
): TimelineEntrySet[] {
  const keySet = new Set(keys);
  return sets
    .map(set => ({
      ...set,
      entryKeys: set.entryKeys.filter(k => !keySet.has(k)),
    }))
    .filter(set => set.entryKeys.length >= 2);
}

export class TimelineSetting extends Entity {
  constructor(private readonly store: TimelineSettingStore) {
    super();
  }

  loading$ = this.store.watchIsLoading();
  setting$ = this.store.watchSetting();
  defaultDisplayAtSource$ = this.store.watchSettingKey(
    'defaultDisplayAtSource'
  );
  grouping$ = this.store.watchSettingKey('grouping');
  sortDesc$ = this.store.watchSettingKey('sortDesc');
  viewMode$ = this.store.watchSettingKey('viewMode');
  zoomLevel$ = this.store.watchSettingKey('zoomLevel');
  hideEmptyPeriods$ = this.store.watchSettingKey('hideEmptyPeriods');
  hiddenEntries$ = this.store.watchSettingKey('hiddenEntries');
  entryGroups$ = this.store.watchSettingKey('entryGroups');
  entryMerges$ = this.store.watchSettingKey('entryMerges');
  tags$ = this.store.watchSettingKey('tags');
  categories$ = this.store.watchSettingKey('categories');
  entryTags$ = this.store.watchSettingKey('entryTags');
  entryCategories$ = this.store.watchSettingKey('entryCategories');
  entryDatePrefixes$ = this.store.watchSettingKey('entryDatePrefixes');
  entryTagPrefixes$ = this.store.watchSettingKey('entryTagPrefixes');
  initialLoadMonths$ = this.store.watchSettingKey('initialLoadMonths');
  viewRange$ = this.store.watchSettingKey('viewRange');

  updateInitialLoadMonths(months: number) {
    this.store.updateSetting('initialLoadMonths', months);
  }

  updateViewRange(start: number, end: number) {
    this.store.updateSetting('viewRange', { start, end });
  }

  clearViewRange() {
    this.store.updateSetting('viewRange', null);
  }

  getDefaultDisplayAtSource(): TimelineDisplayAtSource {
    return this.store.getSettingKey('defaultDisplayAtSource') ?? 'createdAt';
  }

  updateDefaultDisplayAtSource(source: TimelineDisplayAtSource) {
    this.store.updateSetting('defaultDisplayAtSource', source);
  }

  updateGrouping(grouping: TimelineGrouping) {
    this.store.updateSetting('grouping', grouping);
  }

  updateSortDesc(desc: boolean) {
    this.store.updateSetting('sortDesc', desc);
  }

  updateViewMode(viewMode: TimelineViewMode) {
    this.store.updateSetting('viewMode', viewMode);
  }

  updateZoomLevel(zoomLevel: TimelineZoomLevel) {
    this.store.updateSetting('zoomLevel', zoomLevel);
  }

  updateHideEmptyPeriods(hide: boolean) {
    this.store.updateSetting('hideEmptyPeriods', hide);
  }

  zoomIn() {
    const current = this.store.getSettingKey('zoomLevel') ?? 'hour';
    const index = ZOOM_LEVELS.indexOf(current);
    const next = ZOOM_LEVELS[Math.min(index + 1, ZOOM_LEVELS.length - 1)];
    this.updateZoomLevel(next);
  }

  zoomOut() {
    const current = this.store.getSettingKey('zoomLevel') ?? 'hour';
    const index = ZOOM_LEVELS.indexOf(current);
    const next = ZOOM_LEVELS[Math.max(index - 1, 0)];
    this.updateZoomLevel(next);
  }

  hideEntry(docId: string, blockId: string) {
    const key = `${docId}:${blockId}`;
    const hidden = this.store.getSettingKey('hiddenEntries') ?? [];
    if (hidden.includes(key)) return;
    this.store.updateSetting('hiddenEntries', [...hidden, key]);
  }

  /** Hides many entries with a single settings write. */
  hideEntries(entryKeys: string[]) {
    const hidden = this.store.getSettingKey('hiddenEntries') ?? [];
    const next = new Set(hidden);
    for (const key of entryKeys) next.add(key);
    if (next.size === hidden.length) return;
    this.store.updateSetting('hiddenEntries', [...next]);
  }

  unhideEntry(docId: string, blockId: string) {
    const key = `${docId}:${blockId}`;
    const hidden = this.store.getSettingKey('hiddenEntries') ?? [];
    if (!hidden.includes(key)) return;
    this.store.updateSetting(
      'hiddenEntries',
      hidden.filter(k => k !== key)
    );
  }

  /**
   * Fixes the given entries together on the timeline. Members are removed
   * from any existing group or merge first so an entry belongs to at most
   * one set.
   */
  createGroup(entryKeys: string[]) {
    if (entryKeys.length < 2) return;
    const groups = removeKeysFromSets(
      this.store.getSettingKey('entryGroups') ?? [],
      entryKeys
    );
    const merges = removeKeysFromSets(
      this.store.getSettingKey('entryMerges') ?? [],
      entryKeys
    );
    this.store.updateSetting('entryGroups', [
      ...groups,
      { id: newId('group'), entryKeys },
    ]);
    this.store.updateSetting('entryMerges', merges);
  }

  ungroup(groupId: string) {
    const groups = this.store.getSettingKey('entryGroups') ?? [];
    this.store.updateSetting(
      'entryGroups',
      groups.filter(g => g.id !== groupId)
    );
  }

  /** Merges the given entries into a single timeline card. */
  createMerge(entryKeys: string[]) {
    if (entryKeys.length < 2) return;
    const merges = removeKeysFromSets(
      this.store.getSettingKey('entryMerges') ?? [],
      entryKeys
    );
    const groups = removeKeysFromSets(
      this.store.getSettingKey('entryGroups') ?? [],
      entryKeys
    );
    this.store.updateSetting('entryMerges', [
      ...merges,
      { id: newId('merge'), entryKeys },
    ]);
    this.store.updateSetting('entryGroups', groups);
  }

  unmerge(mergeId: string) {
    const merges = this.store.getSettingKey('entryMerges') ?? [];
    this.store.updateSetting(
      'entryMerges',
      merges.filter(m => m.id !== mergeId)
    );
  }

  createTag(name: string): string {
    const tags = this.store.getSettingKey('tags') ?? [];
    const id = newId('tag');
    const color =
      TIMELINE_LABEL_COLORS[tags.length % TIMELINE_LABEL_COLORS.length];
    this.store.updateSetting('tags', [...tags, { id, name, color }]);
    return id;
  }

  updateTag(tagId: string, patch: { name?: string; color?: string }) {
    const tags = this.store.getSettingKey('tags') ?? [];
    this.store.updateSetting(
      'tags',
      tags.map(tag => (tag.id === tagId ? { ...tag, ...patch } : tag))
    );
  }

  updateCategory(categoryId: string, patch: { name?: string; color?: string }) {
    const categories = this.store.getSettingKey('categories') ?? [];
    this.store.updateSetting(
      'categories',
      categories.map(cat =>
        cat.id === categoryId ? { ...cat, ...patch } : cat
      )
    );
  }

  deleteTag(tagId: string) {
    const tags = this.store.getSettingKey('tags') ?? [];
    this.store.updateSetting(
      'tags',
      tags.filter(t => t.id !== tagId)
    );
    const entryTags = this.store.getSettingKey('entryTags') ?? {};
    const next: Record<string, string[]> = {};
    for (const [key, ids] of Object.entries(entryTags)) {
      const filtered = ids.filter(id => id !== tagId);
      if (filtered.length) next[key] = filtered;
    }
    this.store.updateSetting('entryTags', next);
  }

  /** Explicitly assigns or unassigns a tag (used for multi-selection). */
  setEntryTag(entryKey: string, tagId: string, assigned: boolean) {
    const entryTags = this.store.getSettingKey('entryTags') ?? {};
    const current = entryTags[entryKey] ?? [];
    const has = current.includes(tagId);
    if (assigned === has) return;
    const next = assigned
      ? [...current, tagId]
      : current.filter(id => id !== tagId);
    this.store.updateSetting('entryTags', {
      ...entryTags,
      [entryKey]: next,
    });
  }

  /** Assigns or unassigns a tag on many entries with a single write. */
  setEntryTagBatch(entryKeys: string[], tagId: string, assigned: boolean) {
    const entryTags = this.store.getSettingKey('entryTags') ?? {};
    const next = { ...entryTags };
    let changed = false;
    for (const key of entryKeys) {
      const current = next[key] ?? [];
      const has = current.includes(tagId);
      if (assigned === has) continue;
      next[key] = assigned
        ? [...current, tagId]
        : current.filter(id => id !== tagId);
      changed = true;
    }
    if (changed) this.store.updateSetting('entryTags', next);
  }

  toggleEntryTag(entryKey: string, tagId: string) {
    const entryTags = this.store.getSettingKey('entryTags') ?? {};
    const current = entryTags[entryKey] ?? [];
    const next = current.includes(tagId)
      ? current.filter(id => id !== tagId)
      : [...current, tagId];
    this.store.updateSetting('entryTags', {
      ...entryTags,
      [entryKey]: next,
    });
  }

  createCategory(name: string): string {
    const categories = this.store.getSettingKey('categories') ?? [];
    const id = newId('category');
    const color =
      TIMELINE_LABEL_COLORS[
        (categories.length + 3) % TIMELINE_LABEL_COLORS.length
      ];
    this.store.updateSetting('categories', [
      ...categories,
      { id, name, color },
    ]);
    return id;
  }

  deleteCategory(categoryId: string) {
    const categories = this.store.getSettingKey('categories') ?? [];
    this.store.updateSetting(
      'categories',
      categories.filter(c => c.id !== categoryId)
    );
    const entryCategories = this.store.getSettingKey('entryCategories') ?? {};
    const next: Record<string, string> = {};
    for (const [key, id] of Object.entries(entryCategories)) {
      if (id !== categoryId) next[key] = id;
    }
    this.store.updateSetting('entryCategories', next);
  }

  setEntryCategory(entryKey: string, categoryId: string | null) {
    const entryCategories = this.store.getSettingKey('entryCategories') ?? {};
    const next = { ...entryCategories };
    if (categoryId === null || next[entryKey] === categoryId) {
      delete next[entryKey];
    } else {
      next[entryKey] = categoryId;
    }
    this.store.updateSetting('entryCategories', next);
  }

  /** Sets or clears the category on many entries with a single write. */
  setEntryCategoryBatch(entryKeys: string[], categoryId: string | null) {
    const entryCategories = this.store.getSettingKey('entryCategories') ?? {};
    const next = { ...entryCategories };
    let changed = false;
    for (const key of entryKeys) {
      if (categoryId === null) {
        if (key in next) {
          delete next[key];
          changed = true;
        }
      } else if (next[key] !== categoryId) {
        next[key] = categoryId;
        changed = true;
      }
    }
    if (changed) this.store.updateSetting('entryCategories', next);
  }

  /** Stores many parsed date/time prefixes with a single write. */
  setEntryDatePrefixBatch(prefixes: Record<string, string>) {
    const entries = Object.entries(prefixes);
    if (entries.length === 0) return;
    const current = this.store.getSettingKey('entryDatePrefixes') ?? {};
    this.store.updateSetting('entryDatePrefixes', { ...current, ...prefixes });
  }

  /** Stores many parsed tag prefixes with a single write. */
  setEntryTagPrefixBatch(prefixes: Record<string, string>) {
    if (Object.keys(prefixes).length === 0) return;
    const current = this.store.getSettingKey('entryTagPrefixes') ?? {};
    this.store.updateSetting('entryTagPrefixes', { ...current, ...prefixes });
  }

  /**
   * Remembers the date/time prefix parsed from an entry's content so it can
   * be hidden from the content preview. Pass null to clear.
   */
  setEntryDatePrefix(entryKey: string, prefix: string | null) {
    const prefixes = this.store.getSettingKey('entryDatePrefixes') ?? {};
    const next = { ...prefixes };
    if (prefix === null) {
      delete next[entryKey];
    } else {
      next[entryKey] = prefix;
    }
    this.store.updateSetting('entryDatePrefixes', next);
  }
}
