import { Entity } from '@toeverything/infra';

import type { TimelineSettingStore } from '../store/setting';
import type { TimelineDisplayAtSource, TimelineGrouping } from '../type';

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
}
