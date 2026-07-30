export { TIMELINE_LABEL_COLORS, TimelineSetting } from './entities/setting';
export { DEFAULT_INITIAL_LOAD_MONTHS, Timeline } from './entities/timeline';
export { TimelineImportService } from './import/import';
export {
  parseTimelineDataset,
  resolveMediaFile,
  type TimelineImportDataset,
  type TimelineImportEntry,
} from './import/schema';
export { TimelineService } from './services/timeline';
export type {
  TimelineBlockPreview,
  TimelineDisplayAtSource,
  TimelineEntry,
  TimelineEntrySet,
  TimelineGrouping,
  TimelineLabel,
  TimelineSettings,
  TimelineViewMode,
  TimelineZoomLevel,
} from './type';
export {
  parseLeadingDateTime,
  stripParsedPrefix,
  stripParsedPrefixes,
} from './utils/parse-leading-datetime';
export { parseLeadingTag } from './utils/parse-leading-tag';

import type { Framework } from '@toeverything/infra';

import { WorkspaceDBService } from '../db';
import { DocsService } from '../doc';
import { WorkspaceScope, WorkspaceService } from '../workspace';
import { TimelineSetting } from './entities/setting';
import { Timeline } from './entities/timeline';
import { TimelineImportService } from './import/import';
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
    .service(TimelineImportService, [
      DocsService,
      WorkspaceService,
      TimelineSetting,
    ])
    .service(BlocksuiteTimelineConfigService, [
      DocsService,
      TimelineSettingStore,
    ]);
}
