import { TimelineConfigServiceExtension } from '@blocksuite/affine/shared/services';
import { LiveData, OnEvent, Service } from '@toeverything/infra';

import type { DocsService } from '../../doc';
import { type Workspace, WorkspaceInitialized } from '../../workspace';
import type { DocImpl } from '../../workspace/impls/doc';
import type { TimelineSettingStore } from '../store/setting';

/**
 * Provides AFFiNE's `includeInTimeline` doc property and workspace
 * `defaultDisplayAtSource` setting to BlockSuite via `TimelineConfigProvider`,
 * keeping BlockSuite decoupled from AFFiNE doc properties (mirrors
 * `BlocksuiteWriterInfoService`).
 */
@OnEvent(WorkspaceInitialized, i => i.onWorkspaceInitialized)
export class BlocksuiteTimelineConfigService extends Service {
  constructor(
    private readonly docsService: DocsService,
    private readonly settingStore: TimelineSettingStore
  ) {
    super();
    const sub = this.includeInTimelineValues$.subscribe();
    this.disposables.push(() => sub.unsubscribe());
  }

  private readonly includeInTimelineValues$ = LiveData.from(
    this.docsService.propertyValues$('includeInTimeline'),
    new Map<string, string | undefined>()
  );

  onWorkspaceInitialized(workspace: Workspace) {
    const setTimelineConfig = (doc: DocImpl) => {
      doc.storeExtensions.push(
        TimelineConfigServiceExtension({
          isDocIncludedInTimeline: (docId: string) => {
            return !!this.includeInTimelineValues$.value.get(docId);
          },
          defaultDisplayAtSource: () =>
            this.settingStore.getSettingKey('defaultDisplayAtSource') ??
            'createdAt',
        })
      );
    };
    const subscription = workspace.docCollection.meta.docMetaAdded.subscribe(
      docId => {
        const doc = workspace.docCollection.docs.get(docId) as DocImpl;
        setTimelineConfig(doc);
      }
    );
    this.disposables.push(() => subscription.unsubscribe());
  }
}
