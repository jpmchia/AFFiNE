import { RadioGroup } from '@affine/component';
import {
  SettingRow,
  SettingWrapper,
} from '@affine/component/setting-components';
import {
  type TimelineDisplayAtSource,
  TimelineService,
} from '@affine/core/modules/timeline';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback } from 'react';

export const TimelineSettingPanel = () => {
  const t = useI18n();
  const setting = useService(TimelineService).setting;
  const defaultSource = useLiveData(setting.defaultDisplayAtSource$);

  const updateDefaultSource = useCallback(
    (value: string) => {
      setting.updateDefaultDisplayAtSource(value as TimelineDisplayAtSource);
    },
    [setting]
  );

  return (
    <SettingWrapper title={t['com.affine.settings.workspace.timeline.title']()}>
      <SettingRow
        name={t['com.affine.settings.workspace.timeline.default-source']()}
        desc={t['com.affine.settings.workspace.timeline.default-source-desc']()}
      >
        <RadioGroup
          value={defaultSource ?? 'createdAt'}
          onChange={updateDefaultSource}
          items={[
            {
              value: 'createdAt',
              label:
                t['com.affine.settings.workspace.timeline.source.created-at'](),
            },
            {
              value: 'updatedAt',
              label:
                t['com.affine.settings.workspace.timeline.source.updated-at'](),
            },
          ]}
        />
      </SettingRow>
    </SettingWrapper>
  );
};
