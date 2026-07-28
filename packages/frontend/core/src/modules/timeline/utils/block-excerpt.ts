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
