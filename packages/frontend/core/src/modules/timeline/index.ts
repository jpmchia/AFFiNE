export { TimelineSetting } from './entities/setting';
export { Timeline } from './entities/timeline';
export { TimelineService } from './services/timeline';
export type {
  TimelineBlockPreview,
  TimelineDisplayAtSource,
  TimelineEntry,
  TimelineGrouping,
  TimelineSettings,
} from './type';

import type { Framework } from '@toeverything/infra';

import { WorkspaceDBService } from '../db';
import { DocsService } from '../doc';
import { WorkspaceScope } from '../workspace';
import { TimelineSetting } from './entities/setting';
import { Timeline } from './entities/timeline';
import { BlocksuiteTimelineConfigService } from './services/blocksuite-timeline-config';
import { TimelineService } from './services/timeline';
import { TimelineSettingStore } from './store/setting';
import { TimelineStore } from './store/timeline';

export function configureTimelineModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .store(TimelineSettingStore, [WorkspaceDBService])
    .entity(TimelineSetting, [TimelineSettingStore])
    .store(TimelineStore, [DocsService, TimelineSettingStore])
    .entity(Timeline, [TimelineStore, TimelineSetting])
    .service(TimelineService, [TimelineStore, Timeline, TimelineSetting])
    .service(BlocksuiteTimelineConfigService, [
      DocsService,
      TimelineSettingStore,
    ]);
}
