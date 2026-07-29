import { MenuLinkItem } from '@affine/core/modules/app-sidebar/views';
import { FeatureFlagService } from '@affine/core/modules/feature-flag';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import { HistoryIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService, useServices } from '@toeverything/infra';

export const TimelineButton = () => {
  const t = useI18n();
  const featureFlagService = useService(FeatureFlagService);
  const enableTimeline = useLiveData(
    featureFlagService.flags.enable_timeline.$
  );
  const { workbenchService } = useServices({
    WorkbenchService,
  });
  const workbench = workbenchService.workbench;
  const timelineActive = useLiveData(
    workbench.location$.selector(location => location.pathname === '/timeline')
  );

  if (!enableTimeline) {
    return null;
  }

  return (
    <MenuLinkItem
      icon={<HistoryIcon />}
      active={timelineActive}
      to={'/timeline'}
    >
      <span data-testid="timeline">
        {t['com.affine.workspaceSubPath.timeline']()}
      </span>
    </MenuLinkItem>
  );
};
