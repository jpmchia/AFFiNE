import { Button } from '@affine/component';
import { Timeline } from '@affine/core/modules/timeline';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback } from 'react';

import * as styles from './index.css';

/**
 * Affordance to extend the initial-load window when older entries exist
 * beyond the configured period.
 */
export const LoadOlderRow = () => {
  const t = useI18n();
  const timeline = useService(Timeline);
  const olderCount = useLiveData(timeline.olderCount$);
  const handleLoadOlder = useCallback(() => timeline.loadOlder(), [timeline]);
  const handleLoadAll = useCallback(() => timeline.loadAll(), [timeline]);

  if (olderCount === 0) return null;

  return (
    <div className={styles.loadOlderRow} data-testid="timeline-load-older">
      <Button onClick={handleLoadOlder}>
        {t.t('com.affine.timeline.show-older', {
          count: String(olderCount),
        })}
      </Button>
      <Button variant="plain" onClick={handleLoadAll}>
        {t['com.affine.timeline.show-all']()}
      </Button>
    </div>
  );
};
