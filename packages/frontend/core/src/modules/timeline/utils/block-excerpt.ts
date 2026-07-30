import type { BlockModel } from '@blocksuite/affine/store';

const MAX_EXCERPT_LENGTH = 150;

/**
 * Extracts a short preview string for a single block, reusing the same
 * heuristics as `getPagePreviewText` (see
 * `components/page-list/use-block-suite-page-preview.ts`) but scoped to one
 * block instead of walking the whole doc.
 */
export function getBlockExcerpt(block: BlockModel): string {
  const text = (block as { text?: { toString(): string } }).text;
  if (text) {
    const str = text.toString();
    if (str.length) {
      return str.slice(0, MAX_EXCERPT_LENGTH);
    }
  }
  const type = block.flavour.split('affine:')[1] ?? null;
  return type ? `[${type}]` : '';
}

/**
 * Returns true for text-bearing blocks (paragraph, list, code, callout, ...)
 * whose text content is empty or whitespace-only. Such blocks would only
 * render a generic `[paragraph]`-style placeholder in the timeline, so they
 * are hidden by default. Blocks without a `text` field (image, attachment,
 * bookmark, ...) are never considered empty by this check.
 */
export function isEmptyTextBlock(block: BlockModel): boolean {
  const text = (block as { text?: { toString(): string } }).text;
  if (!text) return false;
  return text.toString().trim().length === 0;
}

export type TimelineBlockPreview =
  | { kind: 'text'; text: string }
  | { kind: 'list'; text: string; listType: string; checked: boolean }
  | { kind: 'code'; text: string; language: string | null }
  | { kind: 'callout'; text: string; emoji?: string }
  | { kind: 'image'; caption?: string; sourceId?: string }
  | {
      kind: 'attachment';
      name: string;
      size: number;
      type: string;
      sourceId?: string;
    }
  | {
      kind: 'bookmark';
      url: string;
      title?: string | null;
      description?: string | null;
      icon?: string | null;
    }
  | { kind: 'table'; rowCount: number; columnCount: number }
  | { kind: 'unknown'; excerpt: string };

/**
 * Extracts a block-type-specific preview payload used to render richer
 * timeline entries (e.g. image thumbnails, attachment file info, bookmark
 * link cards) instead of a generic text excerpt.
 */
export function getBlockPreview(block: BlockModel): TimelineBlockPreview {
  const props = block.props as Record<string, unknown>;
  switch (block.flavour) {
    case 'affine:paragraph':
      return { kind: 'text', text: getBlockExcerpt(block) };
    case 'affine:list':
      return {
        kind: 'list',
        text: getBlockExcerpt(block),
        listType: (props.type as string) ?? 'bulleted',
        checked: Boolean(props.checked),
      };
    case 'affine:code':
      return {
        kind: 'code',
        text: getBlockExcerpt(block),
        language: (props.language as string | null) ?? null,
      };
    case 'affine:callout': {
      const icon = props.icon as
        | { type?: string; unicode?: string }
        | undefined;
      return {
        kind: 'callout',
        text: getBlockExcerpt(block),
        emoji: icon?.type === 'emoji' ? icon.unicode : undefined,
      };
    }
    case 'affine:image':
      return {
        kind: 'image',
        caption: (props.caption as string | undefined) || undefined,
        sourceId: props.sourceId as string | undefined,
      };
    case 'affine:attachment':
      return {
        kind: 'attachment',
        name: (props.name as string) ?? '',
        size: (props.size as number) ?? 0,
        type: (props.type as string) ?? '',
        sourceId: props.sourceId as string | undefined,
      };
    case 'affine:bookmark':
      return {
        kind: 'bookmark',
        url: (props.url as string) ?? '',
        title: props.title as string | null | undefined,
        description: props.description as string | null | undefined,
        icon: props.icon as string | null | undefined,
      };
    case 'affine:table':
      return {
        kind: 'table',
        rowCount: Object.keys((props.rows as object) ?? {}).length,
        columnCount: Object.keys((props.columns as object) ?? {}).length,
      };
    default:
      return { kind: 'unknown', excerpt: getBlockExcerpt(block) };
  }
}
