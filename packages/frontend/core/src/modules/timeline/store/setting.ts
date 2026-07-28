import { LiveData, Store } from '@toeverything/infra';

import type { WorkspaceDBService } from '../../db';
import type { TimelineSettings } from '../type';

export class TimelineSettingStore extends Store {
  private readonly key = 'timeline';

  constructor(private readonly dbService: WorkspaceDBService) {
    super();
  }

  watchIsLoading() {
    return this.dbService.userdataDB$
      .map(db => LiveData.from(db.settings.isLoading$, false))
      .flat();
  }

  watchSetting() {
    return this.dbService.userdataDB$
      .map(db => LiveData.from(db.settings.find$({ key: this.key }), []))
      .flat()
      .map(raw => raw?.[0]?.value as TimelineSettings);
  }

  watchSettingKey<T extends keyof TimelineSettings>(key: T) {
    return this.dbService.userdataDB$
      .map(db => LiveData.from(db.settings.find$({ key: this.key }), []))
      .flat()
      .map(raw => {
        const value = raw?.[0]?.value as TimelineSettings;
        if (!value) return undefined;
        return value[key];
      });
  }

  getSettingKey<T extends keyof TimelineSettings>(key: T) {
    const db = this.dbService.userdataDB$.value;
    const value = db.settings.find({ key: this.key })[0]?.value as
      | TimelineSettings
      | undefined;
    return value?.[key];
  }

  updateSetting<T extends keyof TimelineSettings>(
    key: T,
    value: TimelineSettings[T]
  ) {
    const db = this.dbService.userdataDB$.value;
    const prev = db.settings.find({ key: this.key })[0]?.value ?? {};
    db.settings.create({
      key: this.key,
      value: { ...prev, [key]: value },
    });
  }
}
