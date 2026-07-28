import { createIdentifier } from '@blocksuite/global/di';
import type { ExtensionType } from '@blocksuite/store';

export type TimelineDisplayAtSource = 'createdAt' | 'updatedAt';

/**
 * Provides AFFiNE-side timeline configuration to BlockSuite, keeping
 * BlockSuite decoupled from AFFiNE doc properties and workspace settings.
 */
export interface TimelineConfigService {
  isDocIncludedInTimeline(docId: string): boolean;
  defaultDisplayAtSource(): TimelineDisplayAtSource;
}

export const TimelineConfigProvider = createIdentifier<TimelineConfigService>(
  'affine-timeline-config-service'
);

export function TimelineConfigServiceExtension(
  service: TimelineConfigService
): ExtensionType {
  return {
    setup(di) {
      di.addImpl(TimelineConfigProvider, () => service);
    },
  };
}
