import { Button, IconButton, Menu, RadioGroup } from '@affine/component';
import {
  TIMELINE_LABEL_COLORS,
  type TimelineLabel,
  TimelineSetting,
} from '@affine/core/modules/timeline';
import { useI18n } from '@affine/i18n';
import { DeleteIcon, PlusIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useMemo, useState } from 'react';

import * as styles from './labels-sidebar.css';

type LabelKind = 'categories' | 'tags';

const ColorPicker = ({
  color,
  onChange,
}: {
  color: string;
  onChange: (color: string) => void;
}) => {
  return (
    <Menu
      items={
        <div className={styles.palette}>
          {TIMELINE_LABEL_COLORS.map(c => (
            <button
              key={c}
              type="button"
              className={styles.paletteSwatch}
              style={{ background: c }}
              data-active={c === color}
              onClick={() => onChange(c)}
            />
          ))}
        </div>
      }
    >
      <button
        type="button"
        className={styles.swatchButton}
        style={{ background: color }}
        data-testid="timeline-label-swatch"
      />
    </Menu>
  );
};

const LabelRow = ({
  label,
  usageCount,
  onRename,
  onRecolor,
  onDelete,
}: {
  label: TimelineLabel;
  usageCount: number;
  onRename: (name: string) => void;
  onRecolor: (color: string) => void;
  onDelete: () => void;
}) => {
  const [draftName, setDraftName] = useState(label.name);

  const commitName = useCallback(() => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== label.name) {
      onRename(trimmed);
    } else {
      setDraftName(label.name);
    }
  }, [draftName, label.name, onRename]);

  return (
    <div className={styles.row} data-testid="timeline-label-row">
      <ColorPicker color={label.color} onChange={onRecolor} />
      <input
        className={styles.nameInput}
        value={draftName}
        onChange={e => setDraftName(e.target.value)}
        onBlur={commitName}
        onKeyDown={e => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setDraftName(label.name);
        }}
      />
      <span className={styles.usageCount}>{usageCount}</span>
      <IconButton size="16" onClick={onDelete}>
        <DeleteIcon />
      </IconButton>
    </div>
  );
};

export const TimelineLabelsSidebar = () => {
  const t = useI18n();
  const setting = useService(TimelineSetting);
  const [kind, setKind] = useState<LabelKind>('categories');

  const tags = useLiveData(setting.tags$) ?? [];
  const categories = useLiveData(setting.categories$) ?? [];
  const entryTagsRaw = useLiveData(setting.entryTags$);
  const entryCategoriesRaw = useLiveData(setting.entryCategories$);
  const entryTags = useMemo(() => entryTagsRaw ?? {}, [entryTagsRaw]);
  const entryCategories = useMemo(
    () => entryCategoriesRaw ?? {},
    [entryCategoriesRaw]
  );

  const labels = kind === 'categories' ? categories : tags;

  const usageOf = useCallback(
    (labelId: string) => {
      if (kind === 'categories') {
        return Object.values(entryCategories).filter(id => id === labelId)
          .length;
      }
      return Object.values(entryTags).filter(ids => ids.includes(labelId))
        .length;
    },
    [kind, entryCategories, entryTags]
  );

  const handleCreate = useCallback(() => {
    if (kind === 'categories') {
      setting.createCategory(
        t.t('com.affine.timeline.categories.default-name', {
          number: String(categories.length + 1),
        })
      );
    } else {
      setting.createTag(
        t.t('com.affine.timeline.tags.default-name', {
          number: String(tags.length + 1),
        })
      );
    }
  }, [kind, setting, t, categories.length, tags.length]);

  return (
    <div className={styles.container} data-testid="timeline-labels-sidebar">
      <RadioGroup
        className={styles.tabs}
        value={kind}
        onChange={setKind}
        items={[
          {
            value: 'categories',
            label: t['com.affine.timeline.categories'](),
          },
          { value: 'tags', label: t['com.affine.timeline.tags']() },
        ]}
      />
      <div className={styles.list}>
        {labels.length === 0 ? (
          <div className={styles.emptyHint}>
            {kind === 'categories'
              ? t['com.affine.timeline.categories.empty']()
              : t['com.affine.timeline.tags.empty']()}
          </div>
        ) : (
          labels.map(label => (
            <LabelRow
              key={label.id}
              label={label}
              usageCount={usageOf(label.id)}
              onRename={name =>
                kind === 'categories'
                  ? setting.updateCategory(label.id, { name })
                  : setting.updateTag(label.id, { name })
              }
              onRecolor={color =>
                kind === 'categories'
                  ? setting.updateCategory(label.id, { color })
                  : setting.updateTag(label.id, { color })
              }
              onDelete={() =>
                kind === 'categories'
                  ? setting.deleteCategory(label.id)
                  : setting.deleteTag(label.id)
              }
            />
          ))
        )}
      </div>
      <Button prefix={<PlusIcon />} onClick={handleCreate}>
        {kind === 'categories'
          ? t['com.affine.timeline.categories.new']()
          : t['com.affine.timeline.tags.new']()}
      </Button>
    </div>
  );
};
