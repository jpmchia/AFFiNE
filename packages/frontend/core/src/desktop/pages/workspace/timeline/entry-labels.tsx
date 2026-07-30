import { TimelineSetting } from '@affine/core/modules/timeline';
import { useLiveData, useService } from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';

/**
 * Resolves the category and tags assigned to a timeline entry key.
 */
export const useEntryLabels = (entryKey: string) => {
  const setting = useService(TimelineSetting);
  const tags = useLiveData(setting.tags$) ?? [];
  const categories = useLiveData(setting.categories$) ?? [];
  const entryTags = useLiveData(setting.entryTags$) ?? {};
  const entryCategories = useLiveData(setting.entryCategories$) ?? {};

  const assignedTagIds = entryTags[entryKey] ?? [];
  return {
    category: categories.find(c => c.id === entryCategories[entryKey]),
    assignedTags: tags.filter(tag => assignedTagIds.includes(tag.id)),
  };
};

/**
 * Compact tag pills rendered inline next to an entry's title.
 */
export const TagPills = ({
  tags,
}: {
  tags: { id: string; name: string; color: string }[];
}) => {
  if (tags.length === 0) return null;
  return (
    <>
      {tags.map(tag => (
        <span
          key={tag.id}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            fontSize: cssVar('fontXs'),
            lineHeight: '16px',
            padding: '0 6px',
            borderRadius: 8,
            whiteSpace: 'nowrap',
            flexShrink: 0,
            background: `color-mix(in srgb, ${tag.color} 18%, transparent)`,
            color: tag.color,
            border: `1px solid color-mix(in srgb, ${tag.color} 40%, transparent)`,
          }}
          data-testid="timeline-tag-pill"
        >
          {tag.name}
        </span>
      ))}
    </>
  );
};

/**
 * Inline style colouring an entry's border with its category colour.
 */
export function categoryBorderStyle(
  category: { color: string } | undefined
): React.CSSProperties | undefined {
  if (!category) return undefined;
  return {
    borderLeft: `3px solid ${category.color}`,
  };
}
